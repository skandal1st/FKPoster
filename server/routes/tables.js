const express = require('express');
const { run, all } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

router.put('/:id/position', async (req, res) => {
  const { x, y } = req.body;
  await run('UPDATE tables SET x = $1, y = $2 WHERE id = $3 AND tenant_id = $4', [x, y, req.params.id, req.tenantId]);
  res.json({ success: true });
});

router.patch('/:id', async (req, res) => {
  const { x, y, width, height } = req.body;
  const id = req.params.id;
  const updates = [];
  const params = [];
  let idx = 1;
  if (typeof x === 'number') { updates.push(`x = $${idx++}`); params.push(x); }
  if (typeof y === 'number') { updates.push(`y = $${idx++}`); params.push(y); }
  if (typeof width === 'number' && width >= 48 && width <= 200) { updates.push(`width = $${idx++}`); params.push(width); }
  if (typeof height === 'number' && height >= 48 && height <= 200) { updates.push(`height = $${idx++}`); params.push(height); }
  if (updates.length === 0) return res.status(400).json({ error: 'Нет полей для обновления' });
  params.push(id, req.tenantId);
  await run(`UPDATE tables SET ${updates.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx}`, params);
  res.json({ success: true });
});

router.get('/', async (req, res) => {
  const tables = await all(`
    SELECT t.*, h.name as hall_name
    FROM tables t JOIN halls h ON t.hall_id = h.id
    WHERE t.active = true AND h.active = true AND t.tenant_id = $1
    ORDER BY h.id, t.number
  `, [req.tenantId]);
  res.json(tables);
});

module.exports = router;
