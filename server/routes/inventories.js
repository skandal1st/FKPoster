const express = require('express');
const { all, get, run, transaction } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware);
router.use(adminOnly);
router.use(checkSubscription);

router.get('/', async (req, res) => {
  const inventories = await all(`
    SELECT i.*, u.name as user_name
    FROM inventories i
    LEFT JOIN users u ON i.user_id = u.id
    WHERE i.tenant_id = $1
    ORDER BY i.created_at DESC
  `, [req.tenantId]);
  res.json(inventories);
});

router.post('/', async (req, res) => {
  const open = await get("SELECT id FROM inventories WHERE status = 'open' AND tenant_id = $1", [req.tenantId]);
  if (open) return res.status(400).json({ error: 'Есть незакрытая инвентаризация. Закройте её перед созданием новой.' });

  const { note } = req.body;

  const result = await transaction(async (tx) => {
    const invRes = await tx.run(
      'INSERT INTO inventories (user_id, note, tenant_id) VALUES ($1, $2, $3) RETURNING id',
      [req.user.id, note || '', req.tenantId]
    );
    const inventoryId = invRes.id;

    const products = await tx.all(
      'SELECT id, name, quantity, unit FROM products WHERE active = true AND track_inventory = true AND tenant_id = $1 ORDER BY name',
      [req.tenantId]
    );

    for (const p of products) {
      await tx.run(
        'INSERT INTO inventory_items (inventory_id, product_id, product_name, unit, system_quantity) VALUES ($1, $2, $3, $4, $5)',
        [inventoryId, p.id, p.name, p.unit, p.quantity]
      );
    }

    return { id: inventoryId, items_count: products.length };
  });

  res.json(result);
});

router.get('/:id', async (req, res) => {
  const inventory = await get(`
    SELECT i.*, u.name as user_name
    FROM inventories i
    LEFT JOIN users u ON i.user_id = u.id
    WHERE i.id = $1 AND i.tenant_id = $2
  `, [req.params.id, req.tenantId]);
  if (!inventory) return res.status(404).json({ error: 'Инвентаризация не найдена' });

  inventory.items = await all(`
    SELECT ii.*, c.name as category_name, c.color as category_color
    FROM inventory_items ii
    JOIN products p ON ii.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    WHERE ii.inventory_id = $1
    ORDER BY c.sort_order, ii.product_name
  `, [req.params.id]);

  res.json(inventory);
});

router.put('/:id/items', async (req, res) => {
  const inventory = await get("SELECT id, status FROM inventories WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId]);
  if (!inventory) return res.status(404).json({ error: 'Инвентаризация не найдена' });
  if (inventory.status !== 'open') return res.status(400).json({ error: 'Инвентаризация уже закрыта' });

  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Неверный формат данных' });

  for (const item of items) {
    await run(
      'UPDATE inventory_items SET actual_quantity = $1 WHERE id = $2 AND inventory_id = $3',
      [item.actual_quantity, item.id, req.params.id]
    );
  }

  res.json({ success: true });
});

router.post('/:id/apply', async (req, res) => {
  const inventory = await get("SELECT id, status FROM inventories WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId]);
  if (!inventory) return res.status(404).json({ error: 'Инвентаризация не найдена' });
  if (inventory.status !== 'open') return res.status(400).json({ error: 'Инвентаризация уже закрыта' });

  await transaction(async (tx) => {
    const items = await tx.all('SELECT * FROM inventory_items WHERE inventory_id = $1', [req.params.id]);
    for (const item of items) {
      if (item.actual_quantity != null) {
        await tx.run('UPDATE products SET quantity = $1 WHERE id = $2 AND tenant_id = $3', [item.actual_quantity, item.product_id, req.tenantId]);
      }
    }
    await tx.run("UPDATE inventories SET status = 'closed', closed_at = NOW() WHERE id = $1", [req.params.id]);
  });

  res.json({ success: true });
});

module.exports = router;
