import { isCapacitor } from './platform';

const PRODUCTION_DOMAIN = 'skandata.ru';
const BASE_DOMAIN = isCapacitor() ? PRODUCTION_DOMAIN : (import.meta.env.VITE_BASE_DOMAIN || 'lvh.me');

const CAPACITOR_SLUG_KEY = 'capacitor_tenant_slug';

export function getTenantSlug() {
  // В Capacitor нет субдоменов — читаем slug из localStorage
  if (isCapacitor()) {
    return localStorage.getItem(CAPACITOR_SLUG_KEY) || null;
  }

  const host = window.location.hostname;
  const suffix = '.' + BASE_DOMAIN;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  if (!slug || slug.includes('.')) return null;
  return slug;
}

export function isSubdomain() {
  return getTenantSlug() !== null;
}

export function buildSubdomainUrl(slug) {
  const port = window.location.port ? ':' + window.location.port : '';
  const protocol = window.location.protocol;
  return `${protocol}//${slug}.${BASE_DOMAIN}${port}`;
}

/** Сохранить slug тенанта (для Capacitor-режима) */
export function setTenantSlug(slug) {
  if (slug) {
    localStorage.setItem(CAPACITOR_SLUG_KEY, slug);
  } else {
    localStorage.removeItem(CAPACITOR_SLUG_KEY);
  }
}

/** Очистить сохранённый slug (для смены заведения в Capacitor) */
export function clearTenantSlug() {
  localStorage.removeItem(CAPACITOR_SLUG_KEY);
}

export function getBaseDomain() {
  return BASE_DOMAIN;
}
