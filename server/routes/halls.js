const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription, checkLimit } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

router.get('/', async (req, res) => {
  const halls = await all('SELECT * FROM halls WHERE active = true AND tenant_id = $1 ORDER BY id', [req.tenantId]);
  res.json(halls);
});

router.post('/', adminOnly, checkLimit('halls'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Введите название зала' });
  const result = await run('INSERT INTO halls (name, tenant_id) VALUES ($1, $2) RETURNING id', [name, req.tenantId]);
  res.json({ id: result.id, name, active: true });
});

router.put('/:id', adminOnly, async (req, res) => {
  const { name } = req.body;
  await run('UPDATE halls SET name = $1 WHERE id = $2 AND tenant_id = $3', [name, req.params.id, req.tenantId]);
  res.json({ success: true });
});

router.delete('/:id', adminOnly, async (req, res) => {
  await run('UPDATE halls SET active = false WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  res.json({ success: true });
});

router.get('/:id/tables', async (req, res) => {
  const tables = await all(
    'SELECT * FROM tables WHERE hall_id = $1 AND active = true AND tenant_id = $2 ORDER BY number',
    [req.params.id, req.tenantId]
  );
  res.json(tables);
});

router.post('/:id/tables', adminOnly, async (req, res) => {
  const { number, x, y, seats, shape, width, height } = req.body;
  const hallId = req.params.id;
  const num = number != null ? Number(number) : 1;
  const exists = await get(
    'SELECT id FROM tables WHERE hall_id = $1 AND number = $2 AND active = true AND tenant_id = $3',
    [hallId, num, req.tenantId]
  );
  if (exists) return res.status(400).json({ error: 'Столик с таким номером уже существует' });
  const seatsVal = seats != null ? Math.max(1, Math.min(24, Number(seats))) : 4;
  const shapeVal = ['square', 'rectangle', 'round', 'corner'].includes(shape) ? shape : 'square';
  const w = width != null ? Math.max(48, Math.min(200, Number(width))) : 72;
  const h = height != null ? Math.max(48, Math.min(200, Number(height))) : 72;
  const result = await run(
    'INSERT INTO tables (hall_id, number, x, y, seats, shape, width, height, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
    [hallId, num, x ?? 10, y ?? 10, seatsVal, shapeVal, w, h, req.tenantId]
  );
  res.json({
    id: result.id,
    hall_id: Number(hallId),
    number: num,
    x: x ?? 10, y: y ?? 10,
    seats: seatsVal, shape: shapeVal,
    width: w, height: h,
    active: true,
  });
});

router.delete('/:hallId/tables/:tableId', adminOnly, async (req, res) => {
  await run('UPDATE tables SET active = false WHERE id = $1 AND tenant_id = $2', [req.params.tableId, req.tenantId]);
  res.json({ success: true });
});

module.exports = router;
