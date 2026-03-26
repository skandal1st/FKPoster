import { create } from 'zustand';
import { api, OfflineError } from '../api';
import { useNetworkStore } from './networkStore';
import * as syncQueue from '../offline/syncQueue';
import { refreshPendingCount } from '../offline/syncManager';

/**
 * Генерирует локальный ID для офлайн-операций.
 */
function localId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const usePosStore = create((set, get) => ({
  categories: [],
  products: [],
  tables: [],
  halls: [],
  currentOrder: null,
  pendingTableId: null,
  openOrders: [],
  registerDay: null,
  guests: [],
  workshops: [],
  printSettings: null,

  loadGuests: async () => {
    try {
      const guests = await api.get('/guests');
      set({ guests });
    } catch (err) {
      if (err instanceof OfflineError) return; // SW кеш отдаст данные
      throw err;
    }
  },

  loadCategories: async () => {
    try {
      const categories = await api.get('/categories');
      set({ categories });
    } catch (err) {
      if (err instanceof OfflineError) return;
      throw err;
    }
  },

  loadProducts: async () => {
    try {
      const products = await api.get('/products');
      set({ products });
    } catch (err) {
      if (err instanceof OfflineError) return;
      throw err;
    }
  },

  loadTables: async () => {
    try {
      const tables = await api.get('/tables');
      set({ tables });
    } catch (err) {
      if (err instanceof OfflineError) return;
      throw err;
    }
  },

  loadHalls: async () => {
    try {
      const halls = await api.get('/halls');
      set({ halls });
    } catch (err) {
      if (err instanceof OfflineError) return;
      throw err;
    }
  },

  loadWorkshops: async () => {
    try {
      const workshops = await api.get('/workshops');
      set({ workshops });
    } catch { set({ workshops: [] }); }
  },

  loadPrintSettings: async () => {
    try {
      const ps = await api.get('/tenant/print-settings');
      set({ printSettings: ps });
    } catch { set({ printSettings: null }); }
  },

  loadOpenOrders: async () => {
    try {
      const orders = await api.get('/orders?status=open');
      set({ openOrders: orders });
    } catch (err) {
      if (err instanceof OfflineError) return;
      throw err;
    }
  },

  loadRegisterDay: async () => {
    try {
      const day = await api.get('/register/current');
      set({ registerDay: day });
    } catch (err) {
      if (err instanceof OfflineError) return;
      throw err;
    }
  },

  createOrder: async (tableId) => {
    const isOnline = useNetworkStore.getState().isOnline;

    if (isOnline) {
      try {
        const order = await api.post('/orders', { table_id: tableId });
        set({ currentOrder: order, pendingTableId: null });
        get().loadOpenOrders();
        return order;
      } catch (err) {
        // Если ушли офлайн во время запроса — переходим в офлайн-ветку
        if (!(err instanceof OfflineError)) throw err;
      }
    }

    // Офлайн: создаём локальный заказ
    const lid = localId();
    const localOrder = {
      id: lid,
      table_id: tableId,
      items: [],
      total: 0,
      status: 'open',
      created_at: new Date().toISOString(),
      _offline: true,
    };
    await syncQueue.enqueue({
      type: 'create_order',
      method: 'POST',
      url: '/orders',
      body: { table_id: tableId, idempotency_key: lid },
      localRef: lid,
    });
    refreshPendingCount();

    const { openOrders } = get();
    set({ currentOrder: localOrder, pendingTableId: null, openOrders: [...openOrders, localOrder] });
    return localOrder;
  },

  setPendingTable: (tableId) => set({ pendingTableId: tableId, currentOrder: null }),

  selectOrder: async (orderId) => {
    // Если это локальный заказ — найти в openOrders
    if (typeof orderId === 'string' && orderId.startsWith('local_')) {
      const local = get().openOrders.find((o) => o.id === orderId);
      if (local) {
        set({ currentOrder: local });
        return;
      }
    }
    try {
      const order = await api.get(`/orders/${orderId}`);
      set({ currentOrder: order });
    } catch (err) {
      if (err instanceof OfflineError) {
        // Попробовать найти в openOrders
        const cached = get().openOrders.find((o) => o.id === orderId);
        if (cached) set({ currentOrder: cached });
      } else {
        throw err;
      }
    }
  },

  addItem: async (productId, quantity = 1, modifiers = []) => {
    let { currentOrder, pendingTableId } = get();

    // Если нет текущего заказа но есть pendingTable — создаём заказ
    if (!currentOrder && pendingTableId) {
      const newOrder = await get().createOrder(pendingTableId);
      currentOrder = newOrder;
    }
    if (!currentOrder) return;

    const isOnline = useNetworkStore.getState().isOnline;
    const isLocalOrder = currentOrder._offline;

    const body = { product_id: productId, quantity };
    if (modifiers.length > 0) body.modifiers = modifiers;

    if (isOnline && !isLocalOrder) {
      try {
        const order = await api.post(`/orders/${currentOrder.id}/items`, body);
        set({ currentOrder: order });
        return;
      } catch (err) {
        if (!(err instanceof OfflineError)) throw err;
      }
    }

    // Офлайн: обновляем локально
    const { products } = get();
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const hasModifiers = modifiers.length > 0;
    // Если есть модификаторы — всегда новая позиция
    const existingIdx = hasModifiers ? -1 : currentOrder.items.findIndex((i) => i.product_id === productId);
    let updatedItems;

    const modSurcharge = modifiers.reduce((sum, m) => {
      const mod = (product.modifiers || []).find((pm) => pm.id === m.modifier_id);
      return sum + (mod ? parseFloat(mod.price) * (m.quantity || 1) : 0);
    }, 0);

    if (existingIdx >= 0) {
      updatedItems = [...currentOrder.items];
      updatedItems[existingIdx] = {
        ...updatedItems[existingIdx],
        quantity: updatedItems[existingIdx].quantity + quantity,
        total: (updatedItems[existingIdx].quantity + quantity) * parseFloat(product.price),
      };
    } else {
      const itemPrice = parseFloat(product.price) + modSurcharge;
      updatedItems = [...currentOrder.items, {
        id: localId(),
        product_id: productId,
        product_name: product.name,
        quantity,
        price: itemPrice,
        total: quantity * itemPrice,
        modifiers: hasModifiers ? modifiers.map((m) => {
          const mod = (product.modifiers || []).find((pm) => pm.id === m.modifier_id);
          return { modifier_id: m.modifier_id, modifier_name: mod?.name || '', price: mod?.price || 0, quantity: m.quantity || 1 };
        }) : [],
        _offline: true,
      }];
    }

    const newTotal = updatedItems.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
    const updatedOrder = { ...currentOrder, items: updatedItems, total: newTotal };
    set({ currentOrder: updatedOrder });
    _updateOpenOrder(get, set, updatedOrder);

    await syncQueue.enqueue({
      type: 'add_item',
      method: 'POST',
      url: `/orders/${currentOrder.id}/items`,
      body,
      parentRef: isLocalOrder ? currentOrder.id : undefined,
    });
    refreshPendingCount();
  },

  updateItemQty: async (itemId, quantity) => {
    const { currentOrder } = get();
    if (!currentOrder) return;

    const isOnline = useNetworkStore.getState().isOnline;
    const isLocalOrder = currentOrder._offline;

    if (isOnline && !isLocalOrder) {
      try {
        const order = await api.put(`/orders/${currentOrder.id}/items/${itemId}`, { quantity });
        set({ currentOrder: order });
        return;
      } catch (err) {
        if (!(err instanceof OfflineError)) throw err;
      }
    }

    // Офлайн: обновить локально
    let updatedItems;
    if (quantity <= 0) {
      updatedItems = currentOrder.items.filter((i) => i.id !== itemId);
    } else {
      updatedItems = currentOrder.items.map((i) =>
        i.id === itemId ? { ...i, quantity, total: quantity * parseFloat(i.price) } : i
      );
    }

    const newTotal = updatedItems.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
    const updatedOrder = { ...currentOrder, items: updatedItems, total: newTotal };
    set({ currentOrder: updatedOrder });
    _updateOpenOrder(get, set, updatedOrder);

    // Для локальных item'ов не ставим в очередь (они ещё не созданы на сервере)
    if (typeof itemId === 'string' && itemId.startsWith('local_')) return;

    await syncQueue.enqueue({
      type: 'update_item',
      method: 'PUT',
      url: `/orders/${currentOrder.id}/items/${itemId}`,
      body: { quantity },
      parentRef: isLocalOrder ? currentOrder.id : undefined,
    });
    refreshPendingCount();
  },

  removeItem: async (itemId) => {
    const { currentOrder } = get();
    if (!currentOrder) return;

    const isOnline = useNetworkStore.getState().isOnline;
    const isLocalOrder = currentOrder._offline;

    if (isOnline && !isLocalOrder) {
      try {
        const order = await api.delete(`/orders/${currentOrder.id}/items/${itemId}`);
        set({ currentOrder: order });
        return;
      } catch (err) {
        if (!(err instanceof OfflineError)) throw err;
      }
    }

    // Офлайн: удалить локально
    const updatedItems = currentOrder.items.filter((i) => i.id !== itemId);
    const newTotal = updatedItems.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
    const updatedOrder = { ...currentOrder, items: updatedItems, total: newTotal };
    set({ currentOrder: updatedOrder });
    _updateOpenOrder(get, set, updatedOrder);

    if (typeof itemId === 'string' && itemId.startsWith('local_')) return;

    await syncQueue.enqueue({
      type: 'remove_item',
      method: 'DELETE',
      url: `/orders/${currentOrder.id}/items/${itemId}`,
      parentRef: isLocalOrder ? currentOrder.id : undefined,
    });
    refreshPendingCount();
  },

  closeOrder: async (paymentMethod, guestId = null, paidCash = null, paidCard = null, bonusSpend = 0) => {
    const { currentOrder } = get();
    if (!currentOrder) return;

    const isOnline = useNetworkStore.getState().isOnline;
    const isLocalOrder = currentOrder._offline;

    if (isOnline && !isLocalOrder) {
      try {
        const body = { payment_method: paymentMethod };
        if (guestId) body.guest_id = guestId;
        if (bonusSpend > 0) body.bonus_spend = bonusSpend;
        if (paymentMethod === 'mixed') {
          body.paid_cash = paidCash;
          body.paid_card = paidCard;
        }
        const order = await api.post(`/orders/${currentOrder.id}/close`, body);
        set({ currentOrder: null });
        get().loadOpenOrders();
        get().loadRegisterDay();
        get().loadProducts();
        get().loadGuests();
        return order;
      } catch (err) {
        if (err instanceof OfflineError) {
          // Продолжаем в офлайн-ветку
        } else {
          // Пробрасываем спец. ошибку для маркировки
          if (err.message && err.message.includes('маркировки')) {
            const error = new Error(err.message);
            error.requires_marking = true;
            throw error;
          }
          // Пробрасываем спец. ошибку для ККТ
          if (err.message && (err.message.includes('фискализации') || err.message.includes('kkt_error'))) {
            const error = new Error(err.message);
            error.kkt_error = true;
            throw error;
          }
          throw err;
        }
      }
    }

    // Офлайн: закрыть заказ локально
    const body = { payment_method: paymentMethod };
    if (guestId) body.guest_id = guestId;
    if (bonusSpend > 0) body.bonus_spend = bonusSpend;
    if (paymentMethod === 'mixed') {
      body.paid_cash = paidCash;
      body.paid_card = paidCard;
    }

    await syncQueue.enqueue({
      type: 'close_order',
      method: 'POST',
      url: `/orders/${currentOrder.id}/close`,
      body,
      parentRef: isLocalOrder ? currentOrder.id : undefined,
    });
    refreshPendingCount();

    // Убираем заказ из открытых локально
    const updatedOrders = get().openOrders.filter((o) => o.id !== currentOrder.id);
    set({ currentOrder: null, openOrders: updatedOrders });

    return { ...currentOrder, status: 'pending_close', _offlineClosed: true };
  },

  moveOrder: async (newTableId) => {
    const { currentOrder } = get();
    if (!currentOrder) return;

    const isOnline = useNetworkStore.getState().isOnline;

    if (isOnline && !currentOrder._offline) {
      try {
        const order = await api.patch(`/orders/${currentOrder.id}/move`, { table_id: newTableId });
        set({ currentOrder: order });
        get().loadOpenOrders();
        return order;
      } catch (err) {
        if (!(err instanceof OfflineError)) throw err;
      }
    }

    // Офлайн: обновить стол локально
    const updatedOrder = { ...currentOrder, table_id: newTableId };
    set({ currentOrder: updatedOrder });
    _updateOpenOrder(get, set, updatedOrder);

    await syncQueue.enqueue({
      type: 'move_order',
      method: 'PATCH',
      url: `/orders/${currentOrder.id}/move`,
      body: { table_id: newTableId },
      parentRef: currentOrder._offline ? currentOrder.id : undefined,
    });
    refreshPendingCount();
    return updatedOrder;
  },

  cancelOrder: async () => {
    const { currentOrder } = get();
    if (!currentOrder) return;

    const isOnline = useNetworkStore.getState().isOnline;

    if (isOnline && !currentOrder._offline) {
      try {
        await api.post(`/orders/${currentOrder.id}/cancel`);
        set({ currentOrder: null });
        get().loadOpenOrders();
        return;
      } catch (err) {
        if (!(err instanceof OfflineError)) throw err;
      }
    }

    // Офлайн: отменить локально
    if (currentOrder._offline) {
      // Если заказ полностью локальный — просто убираем
      const updatedOrders = get().openOrders.filter((o) => o.id !== currentOrder.id);
      set({ currentOrder: null, openOrders: updatedOrders });
      // Не ставим в очередь — заказ ещё не создан на сервере
      return;
    }

    await syncQueue.enqueue({
      type: 'cancel_order',
      method: 'POST',
      url: `/orders/${currentOrder.id}/cancel`,
      body: {},
    });
    refreshPendingCount();

    const updatedOrders = get().openOrders.filter((o) => o.id !== currentOrder.id);
    set({ currentOrder: null, openOrders: updatedOrders });
  },

  startTimer: async (orderId) => {
    const isOnline = useNetworkStore.getState().isOnline;
    const { currentOrder } = get();

    if (isOnline && !(currentOrder?._offline)) {
      try {
        const order = await api.post(`/orders/${orderId}/start-timer`);
        if (currentOrder && currentOrder.id === orderId) {
          set({ currentOrder: order });
        }
        get().loadOpenOrders();
        return;
      } catch (err) {
        if (!(err instanceof OfflineError)) throw err;
      }
    }

    // Офлайн: установить timer_started_at локально
    const now = new Date().toISOString();
    if (currentOrder && currentOrder.id === orderId) {
      set({ currentOrder: { ...currentOrder, timer_started_at: now } });
    }
    const orders = get().openOrders.map((o) => o.id === orderId ? { ...o, timer_started_at: now } : o);
    set({ openOrders: orders });

    await syncQueue.enqueue({
      type: 'start_timer',
      method: 'POST',
      url: `/orders/${orderId}/start-timer`,
      body: {},
      parentRef: currentOrder?._offline ? currentOrder.id : undefined,
    });
    refreshPendingCount();
  },

  clearCurrentOrder: () => set({ currentOrder: null, pendingTableId: null }),

  reset: () => set({
    categories: [],
    products: [],
    tables: [],
    halls: [],
    currentOrder: null,
    pendingTableId: null,
    openOrders: [],
    registerDay: null,
    guests: [],
    workshops: [],
    printSettings: null,
  }),
}));

/**
 * Обновить заказ в массиве openOrders.
 */
function _updateOpenOrder(get, set, updatedOrder) {
  const orders = get().openOrders.map((o) => o.id === updatedOrder.id ? updatedOrder : o);
  set({ openOrders: orders });
}
