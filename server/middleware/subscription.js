const { get } = require('../db');
const { subscriptionByTenant, resourceCount } = require('../cache');

async function checkSubscription(req, res, next) {
  if (!req.tenantId) return next();

  let sub = subscriptionByTenant.get(req.tenantId);
  if (sub === undefined) {
    sub = await get(`
      SELECT s.*, p.max_users, p.max_halls, p.max_products, p.max_orders_monthly, p.name as plan_name, p.features as plan_features
      FROM subscriptions s
      JOIN plans p ON s.plan_id = p.id
      WHERE s.tenant_id = $1 AND s.status IN ('active', 'trialing')
      ORDER BY s.id DESC LIMIT 1
    `, [req.tenantId]);
    subscriptionByTenant.set(req.tenantId, sub);
  }

  if (!sub) {
    return res.status(402).json({ error: 'Подписка не активна. Обновите план.' });
  }

  if (sub.current_period_end && new Date(sub.current_period_end) < new Date()) {
    return res.status(402).json({ error: 'Подписка истекла. Обновите план.' });
  }

  req.plan = sub;
  next();
}

function checkLimit(resource) {
  return async (req, res, next) => {
    if (!req.plan) return next();

    const limits = {
      users: { column: 'max_users', table: 'users', where: 'tenant_id = $1 AND active = true' },
      halls: { column: 'max_halls', table: 'halls', where: 'tenant_id = $1 AND active = true' },
      products: { column: 'max_products', table: 'products', where: 'tenant_id = $1 AND active = true' },
      orders: { column: 'max_orders_monthly', table: 'orders', where: "tenant_id = $1 AND created_at >= date_trunc('month', NOW())" },
    };

    const config = limits[resource];
    if (!config) return next();

    const maxVal = req.plan[config.column];
    if (!maxVal) return next();

    const cacheKey = `${req.tenantId}:${resource}`;
    let row = resourceCount.get(cacheKey);
    if (row === undefined) {
      row = await get(`SELECT COUNT(*)::int as count FROM ${config.table} WHERE ${config.where}`, [req.tenantId]);
      resourceCount.set(cacheKey, row);
    }
    if (row.count >= maxVal) {
      return res.status(403).json({
        error: `Достигнут лимит плана: максимум ${maxVal} ${resource === 'users' ? 'пользователей' : resource === 'halls' ? 'залов' : resource === 'orders' ? 'заказов в месяц' : 'товаров'}. Обновите план.`,
        limit: maxVal,
        current: row.count,
      });
    }

    next();
  };
}

function checkFeature(feature) {
  return (req, res, next) => {
    if (!req.plan) return next();

    const features = req.plan.plan_features || {};
    if (!features[feature]) {
      return res.status(403).json({
        error: `Функция "${feature}" недоступна на вашем тарифе. Обновите план.`,
        feature,
      });
    }

    next();
  };
}

module.exports = { checkSubscription, checkLimit, checkFeature };
