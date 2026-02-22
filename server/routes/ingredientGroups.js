const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

// Список групп с количеством членов и суммарным остатком
router.get('/', async (req, res) => {
  const groups = await all(`
    SELECT g.*,
      COALESCE(m.member_count, 0)::int as member_count,
      COALESCE(m.total_stock, 0) as total_stock
    FROM ingredient_groups g
    LEFT JOIN (
      SELECT ingredient_group_id,
        COUNT(*) as member_count,
        SUM(quantity) as total_stock
      FROM products
      WHERE ingredient_group_id IS NOT NULL AND active = true
      GROUP BY ingredient_group_id
    ) m ON m.ingredient_group_id = g.id
    WHERE g.tenant_id = $1 AND g.active = true
    ORDER BY g.name
  `, [req.tenantId]);
  for (const g of groups) {
    g.total_stock = parseFloat(g.total_stock) || 0;
  }
  res.json(groups);
});

// Создать группу
router.post('/', adminOnly, async (req, res) => {
  const { name, unit } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название группы' });
  const result = await run(
    'INSERT INTO ingredient_groups (tenant_id, name, unit) VALUES ($1, $2, $3) RETURNING id',
    [req.tenantId, name, unit || 'г']
  );
  res.json({ id: result.id, name });
});

// Обновить группу
router.put('/:id', adminOnly, async (req, res) => {
  const { name, unit } = req.body;
  const group = await get('SELECT * FROM ingredient_groups WHERE id = $1 AND tenant_id = $2 AND active = true', [req.params.id, req.tenantId]);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  await run(
    'UPDATE ingredient_groups SET name = $1, unit = $2 WHERE id = $3',
    [name ?? group.name, unit ?? group.unit, group.id]
  );
  res.json({ success: true });
});

// Мягкое удаление
router.delete('/:id', adminOnly, async (req, res) => {
  const group = await get('SELECT * FROM ingredient_groups WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  // Убрать ингредиенты из группы
  await run('UPDATE products SET ingredient_group_id = NULL WHERE ingredient_group_id = $1', [group.id]);
  await run('UPDATE ingredient_groups SET active = false WHERE id = $1', [group.id]);
  res.json({ success: true });
});

// Члены группы с их остатками
router.get('/:id/members', async (req, res) => {
  const group = await get('SELECT * FROM ingredient_groups WHERE id = $1 AND tenant_id = $2 AND active = true', [req.params.id, req.tenantId]);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  const members = await all(`
    SELECT p.id, p.name, p.quantity, p.cost_price, p.unit
    FROM products p
    WHERE p.ingredient_group_id = $1 AND p.active = true
    ORDER BY p.name
  `, [group.id]);
  for (const m of members) {
    m.quantity = parseFloat(m.quantity) || 0;
    m.cost_price = parseFloat(m.cost_price) || 0;
  }
  res.json(members);
});

module.exports = router;
