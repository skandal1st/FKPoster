const { get } = require('../db');
const config = require('../config');

async function subdomainMiddleware(req, res, next) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
  const baseDomain = config.BASE_DOMAIN.toLowerCase();

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

  const tenant = await get(
    'SELECT id, name, slug, logo_url, accent_color FROM tenants WHERE slug = $1',
    [slug]
  );

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

module.exports = { subdomainMiddleware };
