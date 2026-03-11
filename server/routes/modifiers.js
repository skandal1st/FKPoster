const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

// Список активных модификаторов тенанта (с именем ингредиента)
router.get('/', async (req, res) => {
  const modifiers = await all(`
    SELECT m.*, p.name as ingredient_name
    FROM modifiers m
    LEFT JOIN products p ON m.ingredient_id = p.id
    WHERE m.tenant_id = $1 AND m.active = true
    ORDER BY m.name
  `, [req.tenantId]);
  res.json(modifiers);
});

// Создать модификатор
router.post('/', adminOnly, async (req, res) => {
  const { name, price, cost_price, ingredient_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название модификатора' });

  if (ingredient_id) {
    const ing = await get('SELECT id FROM products WHERE id = $1 AND tenant_id = $2 AND active = true', [ingredient_id, req.tenantId]);
    if (!ing) return res.status(400).json({ error: 'Ингредиент не найден' });
  }

  const result = await run(
    'INSERT INTO modifiers (tenant_id, name, price, cost_price, ingredient_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [req.tenantId, name, price || 0, cost_price || 0, ingredient_id || null]
  );
  const modifier = await get(`
    SELECT m.*, p.name as ingredient_name
    FROM modifiers m
    LEFT JOIN products p ON m.ingredient_id = p.id
    WHERE m.id = $1
  `, [result.id]);
  res.json(modifier);
});

// Обновить модификатор
router.put('/:id', adminOnly, async (req, res) => {
  const { name, price, cost_price, ingredient_id } = req.body;
  const existing = await get('SELECT * FROM modifiers WHERE id = $1 AND tenant_id = $2 AND active = true', [req.params.id, req.tenantId]);
  if (!existing) return res.status(404).json({ error: 'Модификатор не найден' });

  if (ingredient_id) {
    const ing = await get('SELECT id FROM products WHERE id = $1 AND tenant_id = $2 AND active = true', [ingredient_id, req.tenantId]);
    if (!ing) return res.status(400).json({ error: 'Ингредиент не найден' });
  }

  await run(
    'UPDATE modifiers SET name = $1, price = $2, cost_price = $3, ingredient_id = $4 WHERE id = $5 AND tenant_id = $6',
    [
      name ?? existing.name,
      price !== undefined ? price : existing.price,
      cost_price !== undefined ? cost_price : existing.cost_price,
      ingredient_id !== undefined ? (ingredient_id || null) : existing.ingredient_id,
      req.params.id, req.tenantId
    ]
  );
  const modifier = await get(`
    SELECT m.*, p.name as ingredient_name
    FROM modifiers m
    LEFT JOIN products p ON m.ingredient_id = p.id
    WHERE m.id = $1
  `, [req.params.id]);
  res.json(modifier);
});

// Мягкое удаление
router.delete('/:id', adminOnly, async (req, res) => {
  const existing = await get('SELECT id FROM modifiers WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!existing) return res.status(404).json({ error: 'Модификатор не найден' });

  await run('UPDATE modifiers SET active = false WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
