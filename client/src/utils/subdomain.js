const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'lvh.me';

export function getTenantSlug() {
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
