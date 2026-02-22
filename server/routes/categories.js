const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

router.get('/', async (req, res) => {
  const categories = await all(
    `SELECT c.*, w.name as workshop_name
     FROM categories c
     LEFT JOIN workshops w ON c.workshop_id = w.id
     WHERE c.active = true AND c.tenant_id = $1
     ORDER BY c.sort_order, c.id`,
    [req.tenantId]
  );
  res.json(categories);
});

router.post('/', adminOnly, async (req, res) => {
  const { name, color, sort_order, workshop_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Введите название категории' });
  const result = await run(
    'INSERT INTO categories (name, color, sort_order, workshop_id, tenant_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [name, color || '#6366f1', sort_order || 0, workshop_id || null, req.tenantId]
  );
  res.json({ id: result.id, name, color: color || '#6366f1', sort_order: sort_order || 0, workshop_id: workshop_id || null, active: true });
});

router.put('/:id', adminOnly, async (req, res) => {
  const { name, color, sort_order, workshop_id } = req.body;
  const cat = await get('SELECT * FROM categories WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!cat) return res.status(404).json({ error: 'Категория не найдена' });
  await run(
    'UPDATE categories SET name = $1, color = $2, sort_order = $3, workshop_id = $4 WHERE id = $5 AND tenant_id = $6',
    [name || cat.name, color || cat.color, sort_order ?? cat.sort_order, workshop_id !== undefined ? (workshop_id || null) : cat.workshop_id, req.params.id, req.tenantId]
  );
  res.json({ success: true });
});

router.delete('/:id', adminOnly, async (req, res) => {
  await run('UPDATE categories SET active = false WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  res.json({ success: true });
});

module.exports = router;
