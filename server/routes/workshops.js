const express = require('express');
const { all, get, run, transaction } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

router.get('/', async (req, res) => {
  const workshops = await all(`
    SELECT w.*,
      COALESCE(c.cat_count, 0)::int as category_count
    FROM workshops w
    LEFT JOIN (
      SELECT workshop_id, COUNT(*)::int as cat_count
      FROM categories
      WHERE active = true
      GROUP BY workshop_id
    ) c ON c.workshop_id = w.id
    WHERE w.active = true AND w.tenant_id = $1
    ORDER BY w.name
  `, [req.tenantId]);
  res.json(workshops);
});

router.post('/', adminOnly, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Введите название цеха' });
  const result = await run(
    'INSERT INTO workshops (name, tenant_id) VALUES ($1, $2) RETURNING id',
    [name, req.tenantId]
  );
  res.json({ id: result.id, name, active: true, category_count: 0 });
});

router.put('/:id', adminOnly, async (req, res) => {
  const { name } = req.body;
  const ws = await get('SELECT * FROM workshops WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!ws) return res.status(404).json({ error: 'Цех не найден' });
  await run(
    'UPDATE workshops SET name = $1 WHERE id = $2 AND tenant_id = $3',
    [name || ws.name, req.params.id, req.tenantId]
  );
  res.json({ success: true });
});

router.delete('/:id', adminOnly, async (req, res) => {
  const ws = await get('SELECT * FROM workshops WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!ws) return res.status(404).json({ error: 'Цех не найден' });
  await transaction(async (client) => {
    await client.query('UPDATE categories SET workshop_id = NULL WHERE workshop_id = $1', [req.params.id]);
    await client.query('UPDATE workshops SET active = false WHERE id = $1', [req.params.id]);
  });
  res.json({ success: true });
});

module.exports = router;
