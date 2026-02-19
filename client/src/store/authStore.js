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
    if (data.user?.role === 'superadmin' && !data.tenant) {
      sessionStorage.setItem('superadmin_token', data.token);
    }
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
    sessionStorage.removeItem('superadmin_token');
    resetBranding();
    set({ user: null, tenant: null, token: null });
  },

  setImpersonation: (token, user, tenant) => {
    const current = localStorage.getItem('token');
    if (current) sessionStorage.setItem('superadmin_token', current);
    localStorage.setItem('token', token);
    if (tenant) applyBranding(tenant);
    set({ user, tenant, token });
  },

  exitImpersonation: async () => {
    const saved = sessionStorage.getItem('superadmin_token');
    sessionStorage.removeItem('superadmin_token');
    if (!saved) {
      localStorage.removeItem('token');
      resetBranding();
      set({ user: null, tenant: null, token: null, loading: false });
      return;
    }
    localStorage.setItem('token', saved);
    resetBranding();
    set({ user: null, tenant: null, token: null, loading: true });
    try {
      const data = await api.get('/auth/me');
      set({ user: data.user, tenant: data.tenant, loading: false });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, tenant: null, token: null, loading: false });
    }
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
