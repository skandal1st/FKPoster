import { create } from 'zustand';
import { isCapacitor } from '../utils/platform';

export const useNetworkStore = create((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  lastOnlineAt: Date.now(),

  /** Инициализировать слушателей сети */
  init: () => {
    if (isCapacitor()) {
      // Capacitor Network plugin
      import('@capacitor/network').then(({ Network }) => {
        Network.getStatus().then((status) => {
          set({ isOnline: status.connected });
        });
        Network.addListener('networkStatusChange', (status) => {
          const wasOffline = !get().isOnline;
          set({
            isOnline: status.connected,
            ...(status.connected ? { lastOnlineAt: Date.now() } : {}),
          });
          // Вызываем колбэки при переходе offline→online
          if (wasOffline && status.connected) {
            get()._notifyOnlineListeners();
          }
        });
      });
    } else {
      // Web: стандартные события
      window.addEventListener('online', () => {
        const wasOffline = !get().isOnline;
        set({ isOnline: true, lastOnlineAt: Date.now() });
        if (wasOffline) get()._notifyOnlineListeners();
      });
      window.addEventListener('offline', () => {
        set({ isOnline: false });
      });
    }
  },

  /** Подписчики на событие "стали онлайн" */
  _onlineListeners: [],

  _notifyOnlineListeners: () => {
    const listeners = get()._onlineListeners;
    for (const fn of listeners) {
      try { fn(); } catch (e) { console.error('Online listener error:', e); }
    }
  },

  /** Подписаться на событие перехода в онлайн. Возвращает функцию отписки. */
  onOnline: (fn) => {
    set((s) => ({ _onlineListeners: [...s._onlineListeners, fn] }));
    return () => {
      set((s) => ({ _onlineListeners: s._onlineListeners.filter((f) => f !== fn) }));
    };
  },
}));
