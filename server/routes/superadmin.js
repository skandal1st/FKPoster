const express = require('express');
const jwt = require('jsonwebtoken');
const { all, get, run } = require('../db');
const { authMiddleware, superadminOnly } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();
router.use(authMiddleware, superadminOnly);

/** Список заведений с подпиской */
router.get('/tenants', async (req, res) => {
  const tenants = await all(`
    SELECT t.id, t.name, t.slug, t.created_at,
           s.id as subscription_id, s.status as subscription_status, s.current_period_end,
           p.name as plan_name, p.price as plan_price
    FROM tenants t
    LEFT JOIN subscriptions s ON s.tenant_id = t.id AND s.status IN ('active', 'trialing')
    LEFT JOIN plans p ON s.plan_id = p.id
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

  res.json({
    token,
    user: { id: req.user.id, email: req.user.email, name: req.user.name, role: 'owner', tenant_id: Number(tenant_id) },
    tenant,
  });
});

/** Управление подпиской заведения */
router.put('/tenants/:id/subscription', async (req, res) => {
  const tenantId = Number(req.params.id);
  const { plan_id } = req.body;
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

  const existing = await get(
    "SELECT id FROM subscriptions WHERE tenant_id = $1 AND status IN ('active','trialing') ORDER BY id DESC LIMIT 1",
    [tenantId]
  );

  if (existing) {
    await run(
      "UPDATE subscriptions SET plan_id = $1, status = 'active', current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days' WHERE id = $2",
      [plan_id, existing.id]
    );
  } else {
    await run(
      "INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end) VALUES ($1, $2, 'active', NOW() + INTERVAL '30 days')",
      [tenantId, plan_id]
    );
  }

  res.json({ success: true, plan_name: plan.name });
});

/** Список планов для выбора при управлении подпиской */
router.get('/plans', async (req, res) => {
  const plans = await all('SELECT id, name, price, max_users, max_halls, max_products FROM plans WHERE active = true ORDER BY price');
  res.json(plans);
});

module.exports = router;
