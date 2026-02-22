const express = require('express');
const { run, all, get } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

router.put('/:id/position', async (req, res) => {
  const { x, y, grid_x, grid_y } = req.body;
  const id = req.params.id;
  if (grid_x != null && grid_y != null) {
    const row = await get(
      'SELECT h.grid_cols, h.grid_rows FROM tables t JOIN halls h ON t.hall_id = h.id WHERE t.id = $1 AND t.tenant_id = $2',
      [id, req.tenantId]
    );
    const cols = row ? (row.grid_cols ?? 6) : 6;
    const rows = row ? (row.grid_rows ?? 4) : 4;
    const gx = Math.max(0, Math.min(cols - 1, Number(grid_x)));
    const gy = Math.max(0, Math.min(rows - 1, Number(grid_y)));
    const xPct = cols > 1 ? (gx / (cols - 1)) * 100 : 50;
    const yPct = rows > 1 ? (gy / (rows - 1)) * 100 : 50;
    await run('UPDATE tables SET grid_x = $1, grid_y = $2, x = $3, y = $4 WHERE id = $5 AND tenant_id = $6', [gx, gy, xPct, yPct, id, req.tenantId]);
  } else if (x != null && y != null) {
    await run('UPDATE tables SET x = $1, y = $2 WHERE id = $3 AND tenant_id = $4', [x, y, id, req.tenantId]);
  } else {
    return res.status(400).json({ error: 'Укажите x,y или grid_x, grid_y' });
  }
  res.json({ success: true });
});

router.patch('/:id', async (req, res) => {
  const { x, y, width, height, grid_x, grid_y } = req.body;
  const id = req.params.id;
  const updates = [];
  const params = [];
  let idx = 1;
  if (typeof x === 'number') { updates.push(`x = $${idx++}`); params.push(x); }
  if (typeof y === 'number') { updates.push(`y = $${idx++}`); params.push(y); }
  if (typeof grid_x === 'number' && grid_x >= 0) { updates.push(`grid_x = $${idx++}`); params.push(grid_x); }
  if (typeof grid_y === 'number' && grid_y >= 0) { updates.push(`grid_y = $${idx++}`); params.push(grid_y); }
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
