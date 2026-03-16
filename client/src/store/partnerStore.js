import { create } from 'zustand';
import { partnerApi } from '../partnerApi';

export const usePartnerStore = create((set) => ({
  partner: null,
  token: localStorage.getItem('partner_token'),
  loading: true,

  login: async (email, password) => {
    const data = await partnerApi.post('/partner/login', { email, password });
    localStorage.setItem('partner_token', data.token);
    set({ partner: data.partner, token: data.token });
  },

  register: async (name, email, phone, password) => {
    const data = await partnerApi.post('/partner/register', { name, email, phone, password });
    localStorage.setItem('partner_token', data.token);
    set({ partner: data.partner, token: data.token });
  },

  logout: () => {
    localStorage.removeItem('partner_token');
    set({ partner: null, token: null });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('partner_token');
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const data = await partnerApi.get('/partner/me');
      set({ partner: data, loading: false });
    } catch {
      localStorage.removeItem('partner_token');
      set({ partner: null, token: null, loading: false });
    }
  },
}));
