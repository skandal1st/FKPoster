const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription, checkLimit } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

// Get all ingredients (is_ingredient = true)
router.get('/', async (req, res) => {
  const ingredients = await all(`
    SELECT p.*, c.name as category_name, c.color as category_color
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.active = true AND p.is_ingredient = true AND p.tenant_id = $1
    ORDER BY c.sort_order, p.name
  `, [req.tenantId]);
  res.json(ingredients);
});

router.get('/:id', async (req, res) => {
  const ingredient = await get(
    'SELECT * FROM products WHERE id = $1 AND active = true AND is_ingredient = true AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!ingredient) return res.status(404).json({ error: 'Ингредиент не найден' });
  res.json(ingredient);
});

router.post('/', adminOnly, checkLimit('products'), async (req, res) => {
  const { category_id, name, cost_price, quantity, unit, track_inventory, min_quantity } = req.body;
  if (!name || !category_id) return res.status(400).json({ error: 'Заполните обязательные поля' });
  const result = await run(
    `INSERT INTO products (category_id, name, price, cost_price, quantity, unit, track_inventory, is_ingredient, min_quantity, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      category_id,
      name,
      0, // price = 0 for ingredients (not sold separately)
      cost_price || 0,
      quantity || 0,
      unit || 'г',
      track_inventory ?? true,
      true, // is_ingredient = true
      min_quantity || 0,
      req.tenantId
    ]
  );
  res.json({ id: result.id, name });
});

router.put('/:id', adminOnly, async (req, res) => {
  const { category_id, name, cost_price, quantity, unit, track_inventory, min_quantity } = req.body;
  const ing = await get('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!ing) return res.status(404).json({ error: 'Ингредиент не найден' });
  if (!ing.is_ingredient) return res.status(400).json({ error: 'Это не ингредиент' });
  
  await run(
    `UPDATE products SET category_id=$1, name=$2, cost_price=$3, quantity=$4, unit=$5,
     track_inventory=$6, min_quantity=$7
     WHERE id=$8 AND tenant_id=$9`,
    [
      category_id ?? ing.category_id,
      name ?? ing.name,
      cost_price ?? ing.cost_price,
      quantity ?? ing.quantity,
      unit ?? ing.unit,
      track_inventory ?? ing.track_inventory,
      min_quantity ?? ing.min_quantity,
      req.params.id,
      req.tenantId
    ]
  );
  res.json({ success: true });
});

router.delete('/:id', adminOnly, async (req, res) => {
  await run('UPDATE products SET active = false WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  res.json({ success: true });
});

module.exports = router;
