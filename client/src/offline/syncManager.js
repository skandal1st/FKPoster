import { api } from '../api';
import { useNetworkStore } from '../store/networkStore';
import { usePosStore } from '../store/posStore';
import * as syncQueue from './syncQueue';
import { resolveConflict } from './conflictResolver';
import { create } from 'zustand';

/**
 * Стор статуса синхронизации (для UI).
 */
export const useSyncStore = create((set) => ({
  syncing: false,
  pendingCount: 0,
  failedCount: 0,
  progress: 0, // 0..1
  lastError: null,

  _setPending: (count) => set({ pendingCount: count }),
  _setFailed: (count) => set({ failedCount: count }),
  _setSyncing: (syncing) => set({ syncing }),
  _setProgress: (progress) => set({ progress }),
  _setError: (error) => set({ lastError: error }),
}));

/** Маппинг localId → serverId для текущего сеанса sync */
let idMap = {};

/**
 * Запустить синхронизацию всех pending-операций.
 * Вызывается при переходе offline→online.
 */
export async function runSync() {
  const store = useSyncStore.getState();
  if (store.syncing) return; // Уже синхронизируемся

  store._setSyncing(true);
  store._setProgress(0);
  store._setError(null);
  idMap = {};

  try {
    const pending = await syncQueue.getPending();
    if (pending.length === 0) {
      store._setSyncing(false);
      return;
    }

    store._setPending(pending.length);
    let processed = 0;

    for (const op of pending) {
      try {
        const result = await executeOp(op);

        // Если это create_order — запомнить маппинг localRef → server id
        if (op.type === 'create_order' && result?.id && op.localRef) {
          idMap[op.localRef] = result.id;
          await syncQueue.remapOrderId(op.localRef, result.id);
        }

        await syncQueue.markSynced(op.id, result);
      } catch (err) {
        const resolution = resolveConflict(op, err);

        if (resolution.action === 'skip') {
          // Пропустить — пометить как synced (операция не нужна)
          await syncQueue.markSynced(op.id, { skipped: true, reason: resolution.message });
        } else if (resolution.action === 'fail') {
          // Фатальная ошибка — помечаем failed, прекращаем цепочку для этого заказа
          await syncQueue.markFailed(op.id, resolution.message);
          // Если это create_order — помечаем все зависимые как failed
          if (op.localRef) {
            await failDependents(pending, op.localRef, resolution.message);
          }
        } else {
          // retry — оставляем в pending для следующей синхронизации
          await syncQueue.markFailed(op.id, resolution.message);
        }
      }

      processed++;
      store._setProgress(processed / pending.length);
    }

    // Обновить счётчики
    const newPending = await syncQueue.getPending();
    const failed = await syncQueue.getFailed();
    store._setPending(newPending.length);
    store._setFailed(failed.length);

    // Перезагрузить данные с сервера после sync
    await refreshData();

    // Очистка старых записей
    await syncQueue.cleanup();
  } catch (err) {
    console.error('Sync error:', err);
    store._setError(err.message);
  } finally {
    store._setSyncing(false);
  }
}

/**
 * Выполнить одну операцию из очереди.
 */
async function executeOp(op) {
  // Подставить реальные ID из маппинга
  let url = op.url;
  let body = op.body ? { ...op.body } : undefined;

  // Заменить localRef в URL на реальный ID
  for (const [localRef, serverId] of Object.entries(idMap)) {
    url = url.replace(localRef, String(serverId));
  }

  switch (op.method) {
    case 'POST':
      return api.post(url, body);
    case 'PUT':
      return api.put(url, body);
    case 'PATCH':
      return api.patch(url, body);
    case 'DELETE':
      return api.delete(url);
    default:
      return api.get(url);
  }
}

/**
 * Пометить все зависимые операции (по parentRef) как failed.
 */
async function failDependents(pending, localRef, reason) {
  for (const op of pending) {
    if (op.parentRef === localRef && op.status === 'pending') {
      await syncQueue.markFailed(op.id, `Зависимость не синхронизирована: ${reason}`);
    }
  }
}

/**
 * Перезагрузить основные данные с сервера после синхронизации.
 */
async function refreshData() {
  const pos = usePosStore.getState();
  try {
    await Promise.all([
      pos.loadOpenOrders(),
      pos.loadProducts(),
      pos.loadRegisterDay(),
      pos.loadTables(),
    ]);
  } catch (err) {
    console.error('Failed to refresh data after sync:', err);
  }
}

/**
 * Обновить счётчик pending-операций (для UI).
 */
export async function refreshPendingCount() {
  const count = await syncQueue.getPendingCount();
  const failed = await syncQueue.getFailed();
  useSyncStore.getState()._setPending(count);
  useSyncStore.getState()._setFailed(failed.length);
}

/**
 * Инициализировать syncManager: подписаться на переход онлайн.
 */
export function initSyncManager() {
  // Подписаться на переход offline→online
  useNetworkStore.getState().onOnline(() => {
    runSync();
  });

  // Обновить счётчик при старте
  refreshPendingCount();
}
