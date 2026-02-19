const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, ownerOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const subscription = await get(`
    SELECT s.*, p.name as plan_name, p.price as plan_price,
           p.max_users, p.max_halls, p.max_products, p.features
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.tenant_id = $1
    ORDER BY s.id DESC LIMIT 1
  `, [req.tenantId]);

  const plans = await all('SELECT * FROM plans WHERE active = true ORDER BY price');

  res.json({ subscription, plans });
});

router.post('/change-plan', ownerOnly, async (req, res) => {
  const { plan_id } = req.body;
  if (!plan_id) return res.status(400).json({ error: 'Выберите план' });

  const plan = await get('SELECT * FROM plans WHERE id = $1 AND active = true', [plan_id]);
  if (!plan) return res.status(404).json({ error: 'План не найден' });

  // For now: direct plan switch without payment
  const existing = await get(
    "SELECT id FROM subscriptions WHERE tenant_id = $1 AND status IN ('active','trialing') ORDER BY id DESC LIMIT 1",
    [req.tenantId]
  );

  if (existing) {
    await run(
      "UPDATE subscriptions SET plan_id = $1, status = 'active', current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days' WHERE id = $2",
      [plan_id, existing.id]
    );
  } else {
    await run(
      "INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end) VALUES ($1, $2, 'active', NOW() + INTERVAL '30 days')",
      [req.tenantId, plan_id]
    );
  }

  res.json({ success: true, plan_name: plan.name });
});

module.exports = router;
