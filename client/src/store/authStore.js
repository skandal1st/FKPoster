import { create } from 'zustand';
import { api } from '../api';
import { applyBranding, resetBranding } from '../utils/branding';
import { usePosStore } from './posStore';
import { useSocketStore } from './socketStore';
import { isCapacitor } from '../utils/platform';

/**
 * В Capacitor используем @capacitor/preferences для безопасного хранения токена.
 * Fallback на localStorage для веб-версии.
 */
async function saveToken(token) {
  localStorage.setItem('token', token);
  if (isCapacitor()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: 'token', value: token });
    } catch {}
  }
}

async function removeToken() {
  localStorage.removeItem('token');
  if (isCapacitor()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key: 'token' });
    } catch {}
  }
}

export const useAuthStore = create((set) => ({
  user: null,
  tenant: null,
  chain: null,
  plan: null,
  token: localStorage.getItem('token'),
  loading: true,
  impersonating: false,
  chainImpersonating: false,

  login: async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    await saveToken(data.token);
    if (data.user?.role === 'superadmin' && !data.tenant) {
      sessionStorage.setItem('superadmin_token', data.token);
    }
    if (data.tenant) applyBranding(data.tenant);
    set({ user: data.user, tenant: data.tenant, chain: data.chain || null, plan: data.plan || null, token: data.token });
    useSocketStore.getState().connect(data.token);
  },

  register: async (company_name, name, email, password, slug, phone, city, business_type) => {
    const body = { company_name, name, email, password };
    if (slug) body.slug = slug;
    if (phone) body.phone = phone;
    if (city) body.city = city;
    if (business_type) body.business_type = business_type;
    const data = await api.post('/auth/register', body);
    // Не сохраняем токен на main domain — вернём data для редиректа на сабдомен
    return data;
  },

  pinLogin: async (userId, pin) => {
    const data = await api.post('/auth/pin-login', { user_id: userId, pin });
    await saveToken(data.token);
    if (data.tenant) applyBranding(data.tenant);
    set({ user: data.user, tenant: data.tenant, plan: data.plan || null, token: data.token });
    useSocketStore.getState().connect(data.token);
  },

  logout: () => {
    useSocketStore.getState().disconnect();
    removeToken();
    sessionStorage.removeItem('superadmin_token');
    sessionStorage.removeItem('chain_token');
    resetBranding();
    usePosStore.getState().reset();
    set({ user: null, tenant: null, chain: null, plan: null, token: null, impersonating: false, chainImpersonating: false });
  },

  setImpersonation: (token, user, tenant, plan) => {
    const current = localStorage.getItem('token');
    if (current) sessionStorage.setItem('superadmin_token', current);
    saveToken(token);
    if (tenant) applyBranding(tenant);
    set({ user, tenant, chain: null, plan: plan || null, token, impersonating: true, chainImpersonating: false });
    useSocketStore.getState().disconnect();
    useSocketStore.getState().connect(token);
  },

  exitImpersonation: async () => {
    useSocketStore.getState().disconnect();
    const saved = sessionStorage.getItem('superadmin_token');
    sessionStorage.removeItem('superadmin_token');
    if (!saved) {
      await removeToken();
      resetBranding();
      set({ user: null, tenant: null, chain: null, plan: null, token: null, loading: false, impersonating: false, chainImpersonating: false });
      return;
    }
    await saveToken(saved);
    resetBranding();
    set({ user: null, tenant: null, chain: null, plan: null, token: null, loading: true, impersonating: false, chainImpersonating: false });
    try {
      const data = await api.get('/auth/me');
      set({ user: data.user, tenant: data.tenant, chain: data.chain || null, plan: data.plan || null, loading: false });
      useSocketStore.getState().connect(saved);
    } catch {
      await removeToken();
      set({ user: null, tenant: null, chain: null, plan: null, token: null, loading: false });
    }
  },

  setChainImpersonation: (token, user, tenant, plan) => {
    const current = localStorage.getItem('token');
    if (current) sessionStorage.setItem('chain_token', current);
    saveToken(token);
    if (tenant) applyBranding(tenant);
    set({ user, tenant, chain: null, plan: plan || null, token, impersonating: false, chainImpersonating: true });
    useSocketStore.getState().disconnect();
    useSocketStore.getState().connect(token);
  },

  exitChainImpersonation: async () => {
    useSocketStore.getState().disconnect();
    const saved = sessionStorage.getItem('chain_token');
    sessionStorage.removeItem('chain_token');
    if (!saved) {
      await removeToken();
      resetBranding();
      set({ user: null, tenant: null, chain: null, plan: null, token: null, loading: false, impersonating: false, chainImpersonating: false });
      return;
    }
    await saveToken(saved);
    resetBranding();
    set({ user: null, tenant: null, chain: null, plan: null, token: null, loading: true, impersonating: false, chainImpersonating: false });
    try {
      const data = await api.get('/auth/me');
      set({ user: data.user, tenant: data.tenant, chain: data.chain || null, plan: data.plan || null, loading: false });
      useSocketStore.getState().connect(saved);
    } catch {
      await removeToken();
      set({ user: null, tenant: null, chain: null, plan: null, token: null, loading: false });
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
      set({
        user: data.user,
        tenant: data.tenant,
        chain: data.chain || null,
        plan: data.plan || null,
        loading: false,
        impersonating: !!data.user?.superadmin_impersonating,
        chainImpersonating: !!data.user?.chain_impersonating,
      });
      useSocketStore.getState().connect(token);
    } catch {
      await removeToken();
      set({ user: null, tenant: null, chain: null, plan: null, token: null, loading: false, impersonating: false, chainImpersonating: false });
    }
  },

  setTenant: (tenant) => {
    if (tenant) applyBranding(tenant);
    set({ tenant });
  },
}));
