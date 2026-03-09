import { create } from 'zustand';
import { api } from '../api';

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
    const guests = await api.get('/guests');
    set({ guests });
  },

  loadCategories: async () => {
    const categories = await api.get('/categories');
    set({ categories });
  },

  loadProducts: async () => {
    const products = await api.get('/products');
    set({ products });
  },

  loadTables: async () => {
    const tables = await api.get('/tables');
    set({ tables });
  },

  loadHalls: async () => {
    const halls = await api.get('/halls');
    set({ halls });
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
    const orders = await api.get('/orders?status=open');
    set({ openOrders: orders });
  },

  loadRegisterDay: async () => {
    const day = await api.get('/register/current');
    set({ registerDay: day });
  },

  createOrder: async (tableId) => {
    const order = await api.post('/orders', { table_id: tableId });
    set({ currentOrder: order, pendingTableId: null });
    get().loadOpenOrders();
    return order;
  },

  setPendingTable: (tableId) => set({ pendingTableId: tableId, currentOrder: null }),

  selectOrder: async (orderId) => {
    const order = await api.get(`/orders/${orderId}`);
    set({ currentOrder: order });
  },

  addItem: async (productId, quantity = 1) => {
    let { currentOrder, pendingTableId } = get();
    if (!currentOrder && pendingTableId) {
      const newOrder = await api.post('/orders', { table_id: pendingTableId });
      set({ currentOrder: newOrder, pendingTableId: null });
      currentOrder = newOrder;
      get().loadOpenOrders();
    }
    if (!currentOrder) return;
    const order = await api.post(`/orders/${currentOrder.id}/items`, { product_id: productId, quantity });
    set({ currentOrder: order });
  },

  updateItemQty: async (itemId, quantity) => {
    const { currentOrder } = get();
    if (!currentOrder) return;
    const order = await api.put(`/orders/${currentOrder.id}/items/${itemId}`, { quantity });
    set({ currentOrder: order });
  },

  removeItem: async (itemId) => {
    const { currentOrder } = get();
    if (!currentOrder) return;
    const order = await api.delete(`/orders/${currentOrder.id}/items/${itemId}`);
    set({ currentOrder: order });
  },

  closeOrder: async (paymentMethod, guestId = null, paidCash = null, paidCard = null) => {
    const { currentOrder } = get();
    if (!currentOrder) return;
    try {
      const body = { payment_method: paymentMethod };
      if (guestId) body.guest_id = guestId;
      if (paymentMethod === 'mixed') {
        body.paid_cash = paidCash;
        body.paid_card = paidCard;
      }
      const order = await api.post(`/orders/${currentOrder.id}/close`, body);
      set({ currentOrder: null });
      get().loadOpenOrders();
      get().loadRegisterDay();
      get().loadProducts();
      return order;
    } catch (err) {
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
  },

  cancelOrder: async () => {
    const { currentOrder } = get();
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/cancel`);
    set({ currentOrder: null });
    get().loadOpenOrders();
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
