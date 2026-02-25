const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { all, get, run, transaction } = require('../db');
const { authMiddleware, chainOwnerOnly, ownerOnly } = require('../middleware/auth');
const { checkSubscription, checkFeature } = require('../middleware/subscription');
const config = require('../config');
const { generateUniqueSlug } = require('../utils/slugify');

const router = express.Router();

// === Создание сети (до chainOwnerOnly, т.к. у owner ещё нет chain_id) ===
router.post('/create', authMiddleware, ownerOnly, checkSubscription, checkFeature('chain_management'), async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Укажите название сети' });
  }

  if (req.user.chain_id) {
    return res.status(400).json({ error: 'Вы уже являетесь владельцем сети' });
  }

  const result = await transaction(async (tx) => {
    const chainRes = await tx.run('INSERT INTO chains (name) VALUES ($1) RETURNING id', [name]);
    const chainId = chainRes.id;

    // Привязываем текущий tenant к сети
    await tx.run('INSERT INTO chain_tenants (chain_id, tenant_id) VALUES ($1, $2)', [chainId, req.tenantId]);

    // Устанавливаем chain_id на юзере
    await tx.run('UPDATE users SET chain_id = $1 WHERE id = $2', [chainId, req.user.id]);

    return { chainId };
  });

  const chain = await get('SELECT id, name FROM chains WHERE id = $1', [result.chainId]);

  // Возвращаем обновлённый токен с chain_id
  const token = jwt.sign(
    { id: req.user.id, role: req.user.role, tenant_id: req.user.tenant_id, chain_id: chain.id },
    config.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ chain, token });
});

// === Все остальные chain-роуты требуют chainOwnerOnly ===
router.use(authMiddleware, chainOwnerOnly);

/** Список заведений сети с мини-KPI */
router.get('/tenants', async (req, res) => {
  const chainId = req.chainId;
  const tenants = await all(`
    SELECT t.id, t.name, t.slug, t.created_at,
           s.status AS subscription_status, s.current_period_end,
           p.name AS plan_name,
           COALESCE(today.revenue, 0) AS today_revenue,
           COALESCE(today.orders_count, 0) AS today_orders
    FROM chain_tenants ct
    JOIN tenants t ON t.id = ct.tenant_id
    LEFT JOIN LATERAL (
      SELECT id, tenant_id, status, current_period_end, plan_id
      FROM subscriptions
      WHERE tenant_id = t.id AND status IN ('active', 'trialing')
      ORDER BY id DESC LIMIT 1
    ) s ON true
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN LATERAL (
      SELECT SUM(total) AS revenue, COUNT(*) AS orders_count
      FROM orders
      WHERE tenant_id = t.id AND status = 'paid' AND created_at::date = CURRENT_DATE
    ) today ON true
    WHERE ct.chain_id = $1
    ORDER BY t.name
  `, [chainId]);

  res.json(tenants);
});

/** Создать новое заведение в сети */
router.post('/tenants', async (req, res) => {
  const { name, email, password } = req.body;
  const chainId = req.chainId;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Заполните все поля (название, email, пароль)' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
  }

  const existingUser = await get('SELECT id FROM users WHERE email = $1', [email]);
  if (existingUser) {
    return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
  }

  const slug = await generateUniqueSlug(name);

  const result = await transaction(async (tx) => {
    const tenantRes = await tx.run(
      'INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id',
      [name, slug]
    );
    const tenantId = tenantRes.id;

    const hash = await bcrypt.hash(password, 10);
    const userRes = await tx.run(
      'INSERT INTO users (email, username, password, name, role, tenant_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [email, email, hash, name, 'owner', tenantId]
    );

    await tx.run(
      'INSERT INTO chain_tenants (chain_id, tenant_id) VALUES ($1, $2)',
      [chainId, tenantId]
    );

    const freePlan = await tx.get('SELECT id FROM plans WHERE name = $1 AND active = true', ['free']);
    if (freePlan) {
      await tx.run(
        "INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end) VALUES ($1, $2, 'trialing', NOW() + INTERVAL '14 days')",
        [tenantId, freePlan.id]
      );
    }

    const defaultCategories = [
      { name: 'Кальяны', color: '#6366f1', sort_order: 0 },
      { name: 'Напитки', color: '#22c55e', sort_order: 1 },
      { name: 'Еда', color: '#f59e0b', sort_order: 2 },
    ];
    for (const cat of defaultCategories) {
      await tx.run(
        'INSERT INTO categories (name, color, sort_order, tenant_id) VALUES ($1, $2, $3, $4)',
        [cat.name, cat.color, cat.sort_order, tenantId]
      );
    }

    return { tenantId, userId: userRes.id };
  });

  const tenant = await get('SELECT id, name, slug FROM tenants WHERE id = $1', [result.tenantId]);
  res.json(tenant);
});

/** Поиск заведений для добавления в сеть (по названию или slug) */
router.get('/tenants/search', async (req, res) => {
  const chainId = req.chainId;
  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.json([]);
  }

  const tenants = await all(`
    SELECT t.id, t.name, t.slug
    FROM tenants t
    WHERE (LOWER(t.name) LIKE $1 OR LOWER(t.slug) LIKE $1)
      AND t.id NOT IN (SELECT tenant_id FROM chain_tenants WHERE chain_id = $2)
    ORDER BY t.name
    LIMIT 10
  `, [`%${q.toLowerCase()}%`, chainId]);

  res.json(tenants);
});

/** Добавить существующее заведение в сеть */
router.post('/tenants/link', async (req, res) => {
  const chainId = req.chainId;
  const { tenant_id } = req.body;

  if (!tenant_id) {
    return res.status(400).json({ error: 'Укажите tenant_id' });
  }

  const tenant = await get('SELECT id, name, slug FROM tenants WHERE id = $1', [tenant_id]);
  if (!tenant) {
    return res.status(404).json({ error: 'Заведение не найдено' });
  }

  const existing = await get(
    'SELECT id FROM chain_tenants WHERE chain_id = $1 AND tenant_id = $2',
    [chainId, tenant_id]
  );
  if (existing) {
    return res.status(400).json({ error: 'Заведение уже в сети' });
  }

  // Проверяем что заведение не принадлежит другой сети
  const otherChain = await get(
    'SELECT c.name FROM chain_tenants ct JOIN chains c ON c.id = ct.chain_id WHERE ct.tenant_id = $1',
    [tenant_id]
  );
  if (otherChain) {
    return res.status(400).json({ error: `Заведение уже принадлежит сети "${otherChain.name}"` });
  }

  await run('INSERT INTO chain_tenants (chain_id, tenant_id) VALUES ($1, $2)', [chainId, tenant_id]);
  res.json({ success: true, tenant });
});

/** Отвязать заведение от сети */
router.delete('/tenants/:tenantId', async (req, res) => {
  const chainId = req.chainId;
  const tenantId = Number(req.params.tenantId);

  const link = await get(
    'SELECT id FROM chain_tenants WHERE chain_id = $1 AND tenant_id = $2',
    [chainId, tenantId]
  );
  if (!link) {
    return res.status(404).json({ error: 'Заведение не найдено в сети' });
  }

  await run('DELETE FROM chain_tenants WHERE chain_id = $1 AND tenant_id = $2', [chainId, tenantId]);
  res.json({ success: true });
});

/** Войти в заведение сети (имперсонация) */
router.post('/impersonate', async (req, res) => {
  const { tenant_id } = req.body;
  const chainId = req.chainId;

  if (!tenant_id) {
    return res.status(400).json({ error: 'Укажите tenant_id' });
  }

  const link = await get(
    'SELECT id FROM chain_tenants WHERE chain_id = $1 AND tenant_id = $2',
    [chainId, tenant_id]
  );
  if (!link) {
    return res.status(403).json({ error: 'Заведение не принадлежит вашей сети' });
  }

  const tenant = await get('SELECT id, name, slug, logo_url, accent_color FROM tenants WHERE id = $1', [tenant_id]);
  if (!tenant) {
    return res.status(404).json({ error: 'Заведение не найдено' });
  }

  const token = jwt.sign(
    {
      id: req.user.id,
      role: 'owner',
      tenant_id: Number(tenant_id),
      chain_id: chainId,
      chain_impersonating: true,
    },
    config.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: { id: req.user.id, email: req.user.email, name: req.user.name, role: 'owner', tenant_id: Number(tenant_id) },
    tenant,
  });
});

// ==================== Отчёты ====================

/** Хелпер: получить список tenant_id сети */
async function getChainTenantIds(chainId) {
  const rows = await all('SELECT tenant_id FROM chain_tenants WHERE chain_id = $1', [chainId]);
  return rows.map((r) => r.tenant_id);
}

/** Дашборд сети — агрегированные KPI + разбивка по заведениям */
router.get('/stats/dashboard', async (req, res) => {
  const chainId = req.chainId;

  // Общие KPI за сегодня
  const totals = await get(`
    SELECT
      COALESCE(SUM(o.total), 0) AS revenue,
      COALESCE(SUM(oi.cost), 0) AS cost,
      COUNT(DISTINCT o.id) AS orders_count
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(oi2.quantity * p.cost_price), 0) AS cost
      FROM order_items oi2
      LEFT JOIN products p ON p.id = oi2.product_id
      WHERE oi2.order_id = o.id
    ) oi ON true
    WHERE o.tenant_id IN (SELECT tenant_id FROM chain_tenants WHERE chain_id = $1)
      AND o.status = 'paid'
      AND o.created_at::date = CURRENT_DATE
  `, [chainId]);

  const revenue = parseFloat(totals.revenue) || 0;
  const cost = parseFloat(totals.cost) || 0;
  const profit = revenue - cost;
  const ordersCount = parseInt(totals.orders_count) || 0;
  const avgCheck = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;

  // Тренд 7 дней
  const trend = await all(`
    SELECT d.day, COALESCE(SUM(o.total), 0) AS revenue
    FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') AS d(day)
    LEFT JOIN orders o ON o.created_at::date = d.day
      AND o.status = 'paid'
      AND o.tenant_id IN (SELECT tenant_id FROM chain_tenants WHERE chain_id = $1)
    GROUP BY d.day ORDER BY d.day
  `, [chainId]);

  // Разбивка по заведениям
  const perTenant = await all(`
    SELECT t.id, t.name,
      COALESCE(SUM(o.total), 0) AS revenue,
      COUNT(o.id) AS orders_count
    FROM chain_tenants ct
    JOIN tenants t ON t.id = ct.tenant_id
    LEFT JOIN orders o ON o.tenant_id = t.id AND o.status = 'paid' AND o.created_at::date = CURRENT_DATE
    WHERE ct.chain_id = $1
    GROUP BY t.id, t.name
    ORDER BY revenue DESC
  `, [chainId]);

  res.json({
    revenue,
    cost,
    profit,
    orders_count: ordersCount,
    avg_check: avgCheck,
    trend: trend.map((r) => ({ day: r.day, revenue: parseFloat(r.revenue) || 0 })),
    per_tenant: perTenant.map((r) => ({
      id: r.id,
      name: r.name,
      revenue: parseFloat(r.revenue) || 0,
      orders_count: parseInt(r.orders_count) || 0,
    })),
  });
});

/** Продажи по периоду с разбивкой */
router.get('/stats/sales', async (req, res) => {
  const chainId = req.chainId;
  const { from, to, group } = req.query;

  const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo = to || new Date().toISOString().slice(0, 10);
  const interval = group === 'month' ? '1 month' : '1 day';
  const trunc = group === 'month' ? 'month' : 'day';

  // Агрегированные продажи по дням/месяцам
  const sales = await all(`
    SELECT date_trunc($3, o.created_at)::date AS period,
      COALESCE(SUM(o.total), 0) AS revenue,
      COUNT(*) AS orders_count
    FROM orders o
    WHERE o.tenant_id IN (SELECT tenant_id FROM chain_tenants WHERE chain_id = $1)
      AND o.status = 'paid'
      AND o.created_at::date >= $2::date
      AND o.created_at::date <= $4::date
    GROUP BY period ORDER BY period
  `, [chainId, dateFrom, trunc, dateTo]);

  // Итоги
  const summary = await get(`
    SELECT
      COALESCE(SUM(o.total), 0) AS revenue,
      COALESCE(SUM(oi.cost), 0) AS cost,
      COUNT(DISTINCT o.id) AS orders_count
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(oi2.quantity * p.cost_price), 0) AS cost
      FROM order_items oi2
      LEFT JOIN products p ON p.id = oi2.product_id
      WHERE oi2.order_id = o.id
    ) oi ON true
    WHERE o.tenant_id IN (SELECT tenant_id FROM chain_tenants WHERE chain_id = $1)
      AND o.status = 'paid'
      AND o.created_at::date >= $2::date
      AND o.created_at::date <= $3::date
  `, [chainId, dateFrom, dateTo]);

  // Разбивка по заведениям
  const perTenant = await all(`
    SELECT t.id, t.name,
      COALESCE(SUM(o.total), 0) AS revenue,
      COUNT(o.id) AS orders_count
    FROM chain_tenants ct
    JOIN tenants t ON t.id = ct.tenant_id
    LEFT JOIN orders o ON o.tenant_id = t.id AND o.status = 'paid'
      AND o.created_at::date >= $2::date AND o.created_at::date <= $3::date
    WHERE ct.chain_id = $1
    GROUP BY t.id, t.name ORDER BY revenue DESC
  `, [chainId, dateFrom, dateTo]);

  const totalRevenue = parseFloat(summary.revenue) || 0;
  const totalCost = parseFloat(summary.cost) || 0;

  res.json({
    revenue: totalRevenue,
    cost: totalCost,
    profit: totalRevenue - totalCost,
    orders_count: parseInt(summary.orders_count) || 0,
    sales: sales.map((r) => ({ period: r.period, revenue: parseFloat(r.revenue) || 0, orders_count: parseInt(r.orders_count) || 0 })),
    per_tenant: perTenant.map((r) => ({ id: r.id, name: r.name, revenue: parseFloat(r.revenue) || 0, orders_count: parseInt(r.orders_count) || 0 })),
  });
});

/** Сравнение заведений */
router.get('/stats/comparison', async (req, res) => {
  const chainId = req.chainId;
  const { from, to } = req.query;
  const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo = to || new Date().toISOString().slice(0, 10);

  const rows = await all(`
    SELECT t.id, t.name,
      COALESCE(SUM(o.total), 0) AS revenue,
      COALESCE(SUM(oi.cost), 0) AS cost,
      COUNT(DISTINCT o.id) AS orders_count
    FROM chain_tenants ct
    JOIN tenants t ON t.id = ct.tenant_id
    LEFT JOIN orders o ON o.tenant_id = t.id AND o.status = 'paid'
      AND o.created_at::date >= $2::date AND o.created_at::date <= $3::date
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(oi2.quantity * p.cost_price), 0) AS cost
      FROM order_items oi2
      LEFT JOIN products p ON p.id = oi2.product_id
      WHERE oi2.order_id = o.id
    ) oi ON true
    WHERE ct.chain_id = $1
    GROUP BY t.id, t.name ORDER BY revenue DESC
  `, [chainId, dateFrom, dateTo]);

  res.json(rows.map((r) => {
    const revenue = parseFloat(r.revenue) || 0;
    const cost = parseFloat(r.cost) || 0;
    const profit = revenue - cost;
    const orders = parseInt(r.orders_count) || 0;
    return {
      id: r.id,
      name: r.name,
      revenue,
      cost,
      profit,
      margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
      orders_count: orders,
      avg_check: orders > 0 ? Math.round(revenue / orders) : 0,
    };
  }));
});

/** Топ товаров по всей сети */
router.get('/stats/products', async (req, res) => {
  const chainId = req.chainId;
  const { from, to } = req.query;
  const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo = to || new Date().toISOString().slice(0, 10);

  const products = await all(`
    SELECT oi.product_name,
      COALESCE(c.name, 'Без категории') AS category,
      SUM(oi.quantity) AS qty,
      SUM(oi.total) AS revenue,
      SUM(oi.quantity * COALESCE(p.cost_price, 0)) AS cost
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE o.tenant_id IN (SELECT tenant_id FROM chain_tenants WHERE chain_id = $1)
      AND o.status = 'paid'
      AND o.created_at::date >= $2::date
      AND o.created_at::date <= $3::date
    GROUP BY oi.product_name, c.name
    ORDER BY revenue DESC
    LIMIT 20
  `, [chainId, dateFrom, dateTo]);

  // Разбивка по категориям
  const categories = await all(`
    SELECT COALESCE(c.name, 'Без категории') AS name,
      SUM(oi.total) AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE o.tenant_id IN (SELECT tenant_id FROM chain_tenants WHERE chain_id = $1)
      AND o.status = 'paid'
      AND o.created_at::date >= $2::date
      AND o.created_at::date <= $3::date
    GROUP BY c.name ORDER BY revenue DESC
  `, [chainId, dateFrom, dateTo]);

  res.json({
    products: products.map((r) => ({
      product_name: r.product_name,
      category: r.category,
      qty: parseInt(r.qty) || 0,
      revenue: parseFloat(r.revenue) || 0,
      cost: parseFloat(r.cost) || 0,
      profit: (parseFloat(r.revenue) || 0) - (parseFloat(r.cost) || 0),
    })),
    categories: categories.map((r) => ({
      name: r.name,
      revenue: parseFloat(r.revenue) || 0,
    })),
  });
});

module.exports = router;
