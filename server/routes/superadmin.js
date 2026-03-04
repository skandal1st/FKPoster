const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { all, get, run, transaction } = require('../db');
const { authMiddleware, superadminOnly } = require('../middleware/auth');
const config = require('../config');
const { invalidateSubscription } = require('../cache');

const router = express.Router();
router.use(authMiddleware, superadminOnly);

/** Список заведений с подпиской (одна строка на заведение, подписка — последняя активная) */
router.get('/tenants', async (req, res) => {
  const tenants = await all(`
    SELECT t.id, t.name, t.slug, t.city, t.created_at,
           s.id AS subscription_id, s.status AS subscription_status, s.current_period_end,
           p.name AS plan_name, p.price AS plan_price,
           owner.name AS owner_name, owner.phone AS owner_phone
    FROM tenants t
    LEFT JOIN LATERAL (
      SELECT id, tenant_id, status, current_period_end, plan_id
      FROM subscriptions
      WHERE tenant_id = t.id AND status IN ('active', 'trialing')
      ORDER BY id DESC
      LIMIT 1
    ) s ON true
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN LATERAL (
      SELECT name, phone FROM users
      WHERE tenant_id = t.id AND role = 'owner' AND active = true
      ORDER BY id LIMIT 1
    ) owner ON true
    ORDER BY t.name
  `);
  res.json(tenants);
});

/** Войти в заведение (выдать токен от имени владельца этого tenant) */
router.post('/impersonate', async (req, res) => {
  const { tenant_id } = req.body;
  if (!tenant_id) {
    return res.status(400).json({ error: 'Укажите tenant_id' });
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
      superadmin_impersonating: true,
    },
    config.JWT_SECRET,
    { expiresIn: '8h' }
  );

  let plan = null;
  const sub = await get(
    `SELECT p.features, p.max_orders_monthly, p.name as plan_name
     FROM subscriptions s JOIN plans p ON s.plan_id = p.id
     WHERE s.tenant_id = $1 AND s.status IN ('active','trialing')
     ORDER BY s.id DESC LIMIT 1`,
    [tenant_id]
  );
  if (sub) {
    plan = { features: sub.features || {}, limits: { max_orders_monthly: sub.max_orders_monthly }, plan_name: sub.plan_name };
  }

  res.json({
    token,
    user: { id: req.user.id, email: req.user.email, name: req.user.name, role: 'owner', tenant_id: Number(tenant_id) },
    tenant,
    plan,
  });
});

/** Управление подпиской заведения. current_period_end — дата окончания (ISO строка YYYY-MM-DD или с временем). */
router.put('/tenants/:id/subscription', async (req, res) => {
  const tenantId = Number(req.params.id);
  const { plan_id, current_period_end: periodEndParam } = req.body;
  if (!plan_id) {
    return res.status(400).json({ error: 'Укажите plan_id' });
  }

  const tenant = await get('SELECT id FROM tenants WHERE id = $1', [tenantId]);
  if (!tenant) {
    return res.status(404).json({ error: 'Заведение не найдено' });
  }

  const plan = await get('SELECT id, name FROM plans WHERE id = $1 AND active = true', [plan_id]);
  if (!plan) {
    return res.status(404).json({ error: 'План не найден' });
  }

  let periodEndDate = null;
  if (periodEndParam != null && periodEndParam !== '') {
    const d = new Date(periodEndParam);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ error: 'Некорректная дата окончания подписки' });
    }
    periodEndDate = d.toISOString();
  }

  const existing = await get(
    "SELECT id FROM subscriptions WHERE tenant_id = $1 AND status IN ('active','trialing') ORDER BY id DESC LIMIT 1",
    [tenantId]
  );

  if (existing) {
    await run(
      "UPDATE subscriptions SET status = 'expired' WHERE tenant_id = $1 AND id != $2 AND status IN ('active','trialing')",
      [tenantId, existing.id]
    );
    if (periodEndDate) {
      await run(
        "UPDATE subscriptions SET plan_id = $1, status = 'active', current_period_start = NOW(), current_period_end = $2::timestamp WHERE id = $3",
        [plan_id, periodEndDate, existing.id]
      );
    } else {
      await run(
        "UPDATE subscriptions SET plan_id = $1, status = 'active', current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days' WHERE id = $2",
        [plan_id, existing.id]
      );
    }
  } else {
    await run(
      "UPDATE subscriptions SET status = 'expired' WHERE tenant_id = $1 AND status IN ('active','trialing')",
      [tenantId]
    );
    if (periodEndDate) {
      await run(
        "INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end) VALUES ($1, $2, 'active', $3::timestamp)",
        [tenantId, plan_id, periodEndDate]
      );
    } else {
      await run(
        "INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end) VALUES ($1, $2, 'active', NOW() + INTERVAL '30 days')",
        [tenantId, plan_id]
      );
    }
  }

  invalidateSubscription(tenantId);
  res.json({ success: true, plan_name: plan.name });
});

/** Список планов для выбора при управлении подпиской */
router.get('/plans', async (req, res) => {
  const plans = await all(`
    SELECT DISTINCT ON (name) id, name, price, max_users, max_halls, max_products
    FROM plans WHERE active = true ORDER BY name, id
  `);
  res.json(plans.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0)));
});

/** Список всех сетей */
router.get('/chains', async (req, res) => {
  const chains = await all(`
    SELECT c.id, c.name, c.created_at,
      COUNT(ct.id) AS tenants_count,
      u.email AS owner_email, u.name AS owner_name
    FROM chains c
    LEFT JOIN chain_tenants ct ON ct.chain_id = c.id
    LEFT JOIN users u ON u.chain_id = c.id AND u.role = 'chain_owner'
    GROUP BY c.id, c.name, c.created_at, u.email, u.name
    ORDER BY c.name
  `);
  res.json(chains);
});

/** Создать сеть + chain_owner юзера */
router.post('/chains', async (req, res) => {
  const { name, email, password, owner_name } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Заполните все поля (название сети, email, пароль)' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
  }

  const existingUser = await get('SELECT id FROM users WHERE email = $1', [email]);
  if (existingUser) {
    return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
  }

  const result = await transaction(async (tx) => {
    const chainRes = await tx.run('INSERT INTO chains (name) VALUES ($1) RETURNING id', [name]);
    const chainId = chainRes.id;

    const hash = await bcrypt.hash(password, 10);
    const userRes = await tx.run(
      'INSERT INTO users (email, username, password, name, role, chain_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [email, email, hash, owner_name || name, 'chain_owner', chainId]
    );

    return { chainId, userId: userRes.id };
  });

  const chain = await get('SELECT id, name, created_at FROM chains WHERE id = $1', [result.chainId]);
  res.json(chain);
});

module.exports = router;
