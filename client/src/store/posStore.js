import { create } from 'zustand';
import { api } from '../api';

export const usePosStore = create((set, get) => ({
  categories: [],
  products: [],
  tables: [],
  halls: [],
  currentOrder: null,
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
    set({ currentOrder: order });
    get().loadOpenOrders();
    return order;
  },

  selectOrder: async (orderId) => {
    const order = await api.get(`/orders/${orderId}`);
    set({ currentOrder: order });
  },

  addItem: async (productId, quantity = 1) => {
    const { currentOrder } = get();
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

  closeOrder: async (paymentMethod, guestId = null) => {
    const { currentOrder } = get();
    if (!currentOrder) return;
    try {
      const body = { payment_method: paymentMethod };
      if (guestId) body.guest_id = guestId;
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

  clearCurrentOrder: () => set({ currentOrder: null }),

  reset: () => set({
    categories: [],
    products: [],
    tables: [],
    halls: [],
    currentOrder: null,
    openOrders: [],
    registerDay: null,
    guests: [],
    workshops: [],
    printSettings: null,
  }),
}));
