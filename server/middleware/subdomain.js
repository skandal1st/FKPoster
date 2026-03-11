const { get } = require('../db');
const config = require('../config');
const { tenantBySlug } = require('../cache');

async function subdomainMiddleware(req, res, next) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
  const baseDomain = config.BASE_DOMAIN.toLowerCase();

  // Capacitor: X-Tenant-Slug заголовок (доверяем только от Capacitor-клиентов)
  const tenantSlugHeader = req.headers['x-tenant-slug'];
  if (tenantSlugHeader && isCapacitorOrigin(req)) {
    const slug = tenantSlugHeader.toLowerCase();
    let tenant = tenantBySlug.get(slug);
    if (tenant === undefined) {
      tenant = await get(
        'SELECT id, name, slug, logo_url, accent_color FROM tenants WHERE slug = $1',
        [slug]
      );
      tenantBySlug.set(slug, tenant);
    }

    if (!tenant && req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Заведение не найдено' });
    }

    req.isMainDomain = false;
    req.subdomainTenant = tenant || null;
    req.subdomainSlug = slug;
    return next();
  }

  // Проверяем, есть ли сабдомен
  if (host === baseDomain || host === 'localhost' || host === '127.0.0.1') {
    req.isMainDomain = true;
    req.subdomainTenant = null;
    return next();
  }

  // host = slug.basedomain
  const suffix = '.' + baseDomain;
  if (!host.endsWith(suffix)) {
    // Неизвестный домен — считаем основным
    req.isMainDomain = true;
    req.subdomainTenant = null;
    return next();
  }

  const slug = host.slice(0, -suffix.length);
  if (!slug || slug.includes('.')) {
    req.isMainDomain = true;
    req.subdomainTenant = null;
    return next();
  }

  let tenant = tenantBySlug.get(slug);
  if (tenant === undefined) {
    tenant = await get(
      'SELECT id, name, slug, logo_url, accent_color FROM tenants WHERE slug = $1',
      [slug]
    );
    tenantBySlug.set(slug, tenant);
  }

  if (!tenant) {
    // Для API запросов — JSON ошибка, для остального — пусть клиент разберётся
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Заведение не найдено' });
    }
    // Для клиентских запросов пропускаем — SPA покажет ошибку
    req.isMainDomain = false;
    req.subdomainTenant = null;
    req.subdomainSlug = slug;
    return next();
  }

  req.isMainDomain = false;
  req.subdomainTenant = tenant;
  req.subdomainSlug = slug;
  next();
}

/**
 * Проверка: запрос пришёл от Capacitor-клиента.
 * Capacitor WebView отправляет Origin: capacitor://localhost или http://localhost.
 */
function isCapacitorOrigin(req) {
  const origin = req.headers.origin || '';
  const clientType = req.headers['x-client-type'];
  return clientType === 'capacitor' ||
    origin.startsWith('capacitor://') ||
    origin === 'http://localhost';
}

module.exports = { subdomainMiddleware };
