const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

router.get('/current', async (req, res) => {
  const day = await get("SELECT * FROM register_days WHERE status = 'open' AND tenant_id = $1 ORDER BY id DESC LIMIT 1", [req.tenantId]);
  res.json(day || null);
});

router.get('/history', async (req, res) => {
  const days = await all(
    'SELECT r.*, u.name as opened_by_name FROM register_days r LEFT JOIN users u ON r.opened_by = u.id WHERE r.tenant_id = $1 ORDER BY r.id DESC LIMIT 30',
    [req.tenantId]
  );
  res.json(days);
});

router.post('/open', async (req, res) => {
  const existing = await get("SELECT id FROM register_days WHERE status = 'open' AND tenant_id = $1", [req.tenantId]);
  if (existing) {
    return res.status(400).json({ error: 'Кассовый день уже открыт' });
  }

  const { opening_cash } = req.body;
  const result = await run(
    'INSERT INTO register_days (opened_by, opening_cash, expected_cash, tenant_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [req.user.id, opening_cash || 0, opening_cash || 0, req.tenantId]
  );
  const day = await get('SELECT * FROM register_days WHERE id = $1', [result.id]);
  res.json(day);
});

router.post('/close', async (req, res) => {
  const day = await get("SELECT * FROM register_days WHERE status = 'open' AND tenant_id = $1", [req.tenantId]);
  if (!day) {
    return res.status(400).json({ error: 'Нет открытого кассового дня' });
  }

  const openOrders = await get(
    "SELECT COUNT(*)::int as cnt FROM orders WHERE register_day_id = $1 AND status = 'open'",
    [day.id]
  );
  if (openOrders && openOrders.cnt > 0) {
    return res.status(400).json({ error: `Есть ${openOrders.cnt} незакрытых заказов` });
  }

  const { actual_cash } = req.body;
  await run(
    "UPDATE register_days SET status = 'closed', closed_at = NOW(), closed_by = $1, actual_cash = $2 WHERE id = $3",
    [req.user.id, actual_cash ?? day.expected_cash, day.id]
  );
  const updated = await get('SELECT * FROM register_days WHERE id = $1', [day.id]);
  res.json(updated);
});

module.exports = router;
