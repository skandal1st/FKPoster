const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Список уровней бонусной программы тенанта */
router.get('/tiers', wrap(async (req, res) => {
  const tiers = await all(
    'SELECT * FROM loyalty_tiers WHERE tenant_id = $1 ORDER BY min_spent ASC',
    [req.tenantId]
  );
  res.json(tiers);
}));

/** Создать уровень */
router.post('/tiers', adminOnly, wrap(async (req, res) => {
  const { name, min_spent, bonus_rate, sort_order } = req.body;
  const nameStr = typeof name === 'string' ? name.trim() : '';
  if (!nameStr) return res.status(400).json({ error: 'Укажите название уровня' });

  const minSpent = Math.max(0, parseFloat(min_spent) || 0);
  const bonusRate = Math.min(100, Math.max(0, parseFloat(bonus_rate) || 0));
  const order = parseInt(sort_order) || 0;

  const result = await run(
    `INSERT INTO loyalty_tiers (tenant_id, name, min_spent, bonus_rate, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [req.tenantId, nameStr, minSpent, bonusRate, order]
  );
  const tier = await get('SELECT * FROM loyalty_tiers WHERE id = $1', [result.id]);
  res.status(201).json(tier);
}));

/** Обновить уровень */
router.put('/tiers/:id', adminOnly, wrap(async (req, res) => {
  const tier = await get(
    'SELECT id FROM loyalty_tiers WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!tier) return res.status(404).json({ error: 'Уровень не найден' });

  const { name, min_spent, bonus_rate, sort_order } = req.body;
  const updates = [];
  const params = [];
  let idx = 1;

  if (name !== undefined) {
    const nameStr = String(name).trim();
    if (!nameStr) return res.status(400).json({ error: 'Название не может быть пустым' });
    updates.push(`name = $${idx++}`);
    params.push(nameStr);
  }
  if (min_spent !== undefined) {
    updates.push(`min_spent = $${idx++}`);
    params.push(Math.max(0, parseFloat(min_spent) || 0));
  }
  if (bonus_rate !== undefined) {
    updates.push(`bonus_rate = $${idx++}`);
    params.push(Math.min(100, Math.max(0, parseFloat(bonus_rate) || 0)));
  }
  if (sort_order !== undefined) {
    updates.push(`sort_order = $${idx++}`);
    params.push(parseInt(sort_order) || 0);
  }

  if (updates.length === 0) {
    const updated = await get('SELECT * FROM loyalty_tiers WHERE id = $1', [req.params.id]);
    return res.json(updated);
  }

  params.push(req.params.id);
  await run(
    `UPDATE loyalty_tiers SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1}`,
    [...params, req.tenantId]
  );
  const updated = await get('SELECT * FROM loyalty_tiers WHERE id = $1', [req.params.id]);
  res.json(updated);
}));

/** Удалить уровень */
router.delete('/tiers/:id', adminOnly, wrap(async (req, res) => {
  const r = await run(
    'DELETE FROM loyalty_tiers WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'Уровень не найден' });
  res.json({ success: true });
}));

module.exports = router;
