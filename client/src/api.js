import { isCapacitor } from './utils/platform';
import { getTenantSlug, getBaseDomain } from './utils/subdomain';

const API_BASE = '/api';

function getBaseUrl() {
  if (!isCapacitor()) return '';
  // В Capacitor используем абсолютный URL к серверу через субдомен тенанта
  const slug = getTenantSlug();
  const domain = getBaseDomain();
  if (slug) {
    return `https://${slug}.${domain}`;
  }
  // Без slug — главный домен
  return `https://${domain}`;
}

export class OfflineError extends Error {
  constructor(method, url, body) {
    super('Нет соединения с сервером');
    this.name = 'OfflineError';
    this.method = method;
    this.url = url;
    this.body = body;
  }
}

async function request(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // В Capacitor добавляем X-Tenant-Slug и X-Client-Type
  if (isCapacitor()) {
    const slug = getTenantSlug();
    if (slug) headers['X-Tenant-Slug'] = slug;
    headers['X-Client-Type'] = 'capacitor';
  }

  const baseUrl = getBaseUrl();
  const fullUrl = `${baseUrl}${API_BASE}${url}`;

  let res;
  try {
    res = await fetch(fullUrl, { ...options, headers });
  } catch (err) {
    // Сетевая ошибка — offline
    if (err.name === 'TypeError' || err.message === 'Failed to fetch' || err.message === 'Network request failed') {
      throw new OfflineError(options.method || 'GET', url, options.body);
    }
    throw err;
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Ошибка сервера: некорректный ответ');
  }
  if (!res.ok) {
    throw new Error(data.error || 'Ошибка сервера');
  }
  return data;
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
  put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (url, body) => request(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (url) => request(url, { method: 'DELETE' }),
};
