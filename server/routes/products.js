const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription, checkLimit } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

router.get('/', async (req, res) => {
  const products = await all(`
    SELECT p.*, c.name as category_name, c.color as category_color
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.active = true AND p.is_ingredient = false AND p.tenant_id = $1
    ORDER BY c.sort_order, p.name
  `, [req.tenantId]);
  for (const p of products) {
    p.ingredients = await all(`
      SELECT pi.*, pr.name as ingredient_name, pr.unit as ingredient_unit, pr.cost_price as ingredient_cost, pr.quantity as ingredient_quantity
      FROM product_ingredients pi
      JOIN products pr ON pi.ingredient_id = pr.id
      WHERE pi.product_id = $1
    `, [p.id]);
    // Остаток составного товара = минимум по ингредиентам: (остаток ингредиента / расход на порцию)
    if (p.is_composite && p.ingredients && p.ingredients.length > 0) {
      const outAmt = Number(p.output_amount) || 1;
      let minPortions = Infinity;
      for (const ing of p.ingredients) {
        const stock = Number(ing.ingredient_quantity) || 0;
        const amount = Number(ing.amount) || 0;
        if (amount <= 0) continue;
        const portions = Math.floor((stock * outAmt) / amount);
        if (portions < minPortions) minPortions = portions;
      }
      p.available_from_ingredients = minPortions === Infinity ? 0 : minPortions;
    }
  }
  res.json(products);
});

router.get('/low-stock', async (req, res) => {
  const items = await all(`
    SELECT p.id, p.name, p.quantity, p.min_quantity, p.unit, c.name as category_name, c.color as category_color
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.active = true AND p.is_ingredient = false AND p.track_inventory = true AND p.min_quantity > 0 AND p.quantity <= p.min_quantity AND p.tenant_id = $1
    ORDER BY (p.quantity / NULLIF(p.min_quantity, 0)) ASC
  `, [req.tenantId]);
  res.json({ count: items.length, items });
});

router.get('/:id', async (req, res) => {
  const product = await get('SELECT * FROM products WHERE id = $1 AND active = true AND is_ingredient = false AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  product.ingredients = await all(`
    SELECT pi.*, pr.name as ingredient_name, pr.unit as ingredient_unit, pr.cost_price as ingredient_cost, pr.quantity as ingredient_quantity
    FROM product_ingredients pi
    JOIN products pr ON pi.ingredient_id = pr.id
    WHERE pi.product_id = $1
  `, [product.id]);
  if (product.is_composite && product.ingredients && product.ingredients.length > 0) {
    const outAmt = Number(product.output_amount) || 1;
    let minPortions = Infinity;
    for (const ing of product.ingredients) {
      const stock = Number(ing.ingredient_quantity) || 0;
      const amount = Number(ing.amount) || 0;
      if (amount <= 0) continue;
      const portions = Math.floor((stock * outAmt) / amount);
      if (portions < minPortions) minPortions = portions;
    }
    product.available_from_ingredients = minPortions === Infinity ? 0 : minPortions;
  }
  res.json(product);
});

router.post('/', adminOnly, checkLimit('products'), async (req, res) => {
  const { category_id, name, price, cost_price, quantity, unit, track_inventory, is_composite, output_amount, recipe_description, min_quantity } = req.body;
  if (!name || !category_id) return res.status(400).json({ error: 'Заполните обязательные поля' });
  const result = await run(
    `INSERT INTO products (category_id, name, price, cost_price, quantity, unit, track_inventory, is_composite, output_amount, recipe_description, min_quantity, is_ingredient, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [category_id, name, price || 0, cost_price || 0, quantity || 0, unit || 'шт',
     track_inventory ?? true, is_composite ?? false, output_amount || 1, recipe_description || '', min_quantity || 0, false, req.tenantId]
  );
  res.json({ id: result.id, name });
});

router.put('/:id', adminOnly, async (req, res) => {
  const { category_id, name, price, cost_price, quantity, unit, track_inventory, is_composite, output_amount, recipe_description, min_quantity } = req.body;
  const p = await get('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!p) return res.status(404).json({ error: 'Товар не найден' });
  const costPriceNum = cost_price !== undefined && cost_price !== null ? Number(cost_price) : Number(p.cost_price);
  await run(
    `UPDATE products SET category_id=$1, name=$2, price=$3, cost_price=$4, quantity=$5, unit=$6,
     track_inventory=$7, is_composite=$8, output_amount=$9, recipe_description=$10, min_quantity=$11
     WHERE id=$12 AND tenant_id=$13`,
    [
      category_id ?? p.category_id, name ?? p.name, price ?? p.price, costPriceNum,
      quantity ?? p.quantity, unit ?? p.unit, track_inventory ?? p.track_inventory, is_composite ?? p.is_composite,
      output_amount ?? p.output_amount, recipe_description ?? p.recipe_description,
      min_quantity ?? p.min_quantity,
      req.params.id, req.tenantId
    ]
  );
  const updated = await get('SELECT id, name, price, cost_price, quantity, unit, category_id, track_inventory, is_composite, output_amount, recipe_description, min_quantity FROM products WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  res.json(updated);
});

router.put('/:id/ingredients', adminOnly, async (req, res) => {
  const { ingredients, output_amount, recipe_description } = req.body;
  const product = await get('SELECT id FROM products WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });

  await run('DELETE FROM product_ingredients WHERE product_id = $1', [req.params.id]);
  const hasIngredients = ingredients && ingredients.length > 0;
  if (hasIngredients) {
    for (const ing of ingredients) {
      await run(
        'INSERT INTO product_ingredients (product_id, ingredient_id, amount) VALUES ($1, $2, $3)',
        [req.params.id, ing.ingredient_id, ing.amount]
      );
    }
  }
  let totalCost = 0;
  if (hasIngredients) {
    for (const ing of ingredients) {
      const ingProduct = await get('SELECT cost_price FROM products WHERE id = $1', [ing.ingredient_id]);
      totalCost += ingProduct ? ingProduct.cost_price * ing.amount : 0;
    }
  }
  const outAmt = (output_amount && output_amount > 0) ? output_amount : 1;
  const costPrice = hasIngredients ? totalCost / outAmt : undefined;

  const updates = [];
  const params = [];
  let idx = 1;
  if (costPrice !== undefined) { updates.push(`cost_price = $${idx++}`); params.push(costPrice); }
  updates.push(`is_composite = $${idx++}`); params.push(hasIngredients);
  if (output_amount !== undefined) { updates.push(`output_amount = $${idx++}`); params.push(outAmt); }
  if (recipe_description !== undefined) { updates.push(`recipe_description = $${idx++}`); params.push(recipe_description); }
  params.push(req.params.id, req.tenantId);
  await run(`UPDATE products SET ${updates.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx}`, params);
  res.json({ success: true });
});

router.delete('/:id', adminOnly, async (req, res) => {
  await run('UPDATE products SET active = false WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  res.json({ success: true });
});

module.exports = router;
