import { create } from 'zustand';
import { io } from 'socket.io-client';
import { usePosStore } from './posStore';

export const useSocketStore = create((set, get) => ({
  socket: null,
  connected: false,

  connect: (token) => {
    const { socket: existing } = get();
    if (existing) existing.disconnect();

    const socket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      set({ connected: true });
    });

    socket.on('disconnect', () => {
      set({ connected: false });
    });

    // Order events
    socket.on('order:created', () => {
      usePosStore.getState().loadOpenOrders();
    });

    socket.on('order:updated', (data) => {
      const pos = usePosStore.getState();
      pos.loadOpenOrders();
      // Update current order if it's the same one
      if (pos.currentOrder && pos.currentOrder.id === data.id) {
        usePosStore.setState({ currentOrder: data });
      }
    });

    socket.on('order:closed', () => {
      const pos = usePosStore.getState();
      pos.loadOpenOrders();
      pos.loadRegisterDay();
      pos.loadProducts();
    });

    socket.on('order:cancelled', () => {
      usePosStore.getState().loadOpenOrders();
    });

    // Register events
    socket.on('register:opened', () => {
      usePosStore.getState().loadRegisterDay();
    });

    socket.on('register:closed', () => {
      usePosStore.getState().loadRegisterDay();
    });

    set({ socket, connected: false });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({ socket: null, connected: false });
  },
}));
