import { create } from 'zustand';
import { api } from '../api';
import { applyBranding, resetBranding } from '../utils/branding';

export const useAuthStore = create((set) => ({
  user: null,
  tenant: null,
  token: localStorage.getItem('token'),
  loading: true,

  login: async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    if (data.tenant) applyBranding(data.tenant);
    set({ user: data.user, tenant: data.tenant, token: data.token });
  },

  register: async (company_name, name, email, password) => {
    const data = await api.post('/auth/register', { company_name, name, email, password });
    localStorage.setItem('token', data.token);
    if (data.tenant) applyBranding(data.tenant);
    set({ user: data.user, tenant: data.tenant, token: data.token });
  },

  logout: () => {
    localStorage.removeItem('token');
    resetBranding();
    set({ user: null, tenant: null, token: null });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const data = await api.get('/auth/me');
      if (data.tenant) applyBranding(data.tenant);
      set({ user: data.user, tenant: data.tenant, loading: false });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, tenant: null, token: null, loading: false });
    }
  },

  setTenant: (tenant) => {
    if (tenant) applyBranding(tenant);
    set({ tenant });
  },
}));
