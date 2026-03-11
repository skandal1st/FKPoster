import { openDB } from 'idb';

const DB_NAME = 'hookahpos-sync';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

let dbPromise;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('status', 'status');
          store.createIndex('localRef', 'localRef');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Добавить операцию в очередь синхронизации.
 * @param {Object} op
 * @param {string} op.type — тип операции (create_order, add_item, close_order, cancel_order и т.д.)
 * @param {string} op.method — HTTP метод (POST, PUT, DELETE)
 * @param {string} op.url — путь API (/orders, /orders/123/items, etc.)
 * @param {Object} [op.body] — тело запроса
 * @param {string} [op.localRef] — локальный ID (для маппинга local → server)
 * @param {string} [op.parentRef] — localRef родительской операции (для зависимых операций)
 */
export async function enqueue(op) {
  const db = await getDb();
  const entry = {
    ...op,
    status: 'pending',
    timestamp: Date.now(),
    retries: 0,
    error: null,
  };
  const id = await db.add(STORE_NAME, entry);
  return { ...entry, id };
}

/** Получить все pending-операции в порядке добавления */
export async function getPending() {
  const db = await getDb();
  const all = await db.getAllFromIndex(STORE_NAME, 'status', 'pending');
  return all.sort((a, b) => a.id - b.id);
}

/** Пометить операцию как успешно синхронизированную */
export async function markSynced(id, serverResponse) {
  const db = await getDb();
  const entry = await db.get(STORE_NAME, id);
  if (!entry) return;
  entry.status = 'synced';
  entry.serverResponse = serverResponse;
  entry.syncedAt = Date.now();
  await db.put(STORE_NAME, entry);
}

/** Пометить операцию как failed */
export async function markFailed(id, error) {
  const db = await getDb();
  const entry = await db.get(STORE_NAME, id);
  if (!entry) return;
  entry.status = 'failed';
  entry.error = error;
  entry.retries = (entry.retries || 0) + 1;
  await db.put(STORE_NAME, entry);
}

/** Получить все failed-операции */
export async function getFailed() {
  const db = await getDb();
  return db.getAllFromIndex(STORE_NAME, 'status', 'failed');
}

/**
 * После создания заказа на сервере: обновить URL во всех зависимых операциях
 * (заменить localRef на реальный serverId).
 * @param {string} localRef — локальный ID заказа (local_xxxx)
 * @param {number|string} serverId — реальный ID заказа с сервера
 */
export async function remapOrderId(localRef, serverId) {
  const db = await getDb();
  const pending = await getPending();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const op of pending) {
    if (op.parentRef === localRef) {
      // Заменить localRef в URL на serverId
      op.url = op.url.replace(localRef, String(serverId));
      op.parentRef = null; // уже замаплен
      await tx.store.put(op);
    }
  }
  await tx.done;
}

/** Получить количество ожидающих операций */
export async function getPendingCount() {
  const db = await getDb();
  const pending = await db.getAllFromIndex(STORE_NAME, 'status', 'pending');
  return pending.length;
}

/** Очистить синхронизированные записи старше N дней */
export async function cleanup(maxAgeDays = 7) {
  const db = await getDb();
  const all = await db.getAll(STORE_NAME);
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const entry of all) {
    if (entry.status === 'synced' && entry.syncedAt < cutoff) {
      await tx.store.delete(entry.id);
    }
  }
  await tx.done;
}

/** Retry все failed-операции (переводит их обратно в pending) */
export async function retryFailed() {
  const db = await getDb();
  const failed = await getFailed();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const entry of failed) {
    entry.status = 'pending';
    entry.error = null;
    await tx.store.put(entry);
  }
  await tx.done;
}
