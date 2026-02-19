const express = require('express');
const { all, get, run, transaction } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

router.get('/', async (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT o.*, t.number as table_number, h.name as hall_name, u.name as user_name
    FROM orders o
    LEFT JOIN tables t ON o.table_id = t.id
    LEFT JOIN halls h ON t.hall_id = h.id
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.tenant_id = $1
  `;
  const params = [req.tenantId];
  if (status) {
    sql += ' AND o.status = $2';
    params.push(status);
  }
  sql += ' ORDER BY o.id DESC LIMIT 100';
  const orders = await all(sql, params);
  res.json(orders);
});

router.get('/:id', async (req, res) => {
  const order = await get(`
    SELECT o.*, t.number as table_number, h.name as hall_name
    FROM orders o
    LEFT JOIN tables t ON o.table_id = t.id
    LEFT JOIN halls h ON t.hall_id = h.id
    WHERE o.id = $1 AND o.tenant_id = $2
  `, [req.params.id, req.tenantId]);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  order.items = await all('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  res.json(order);
});

router.post('/', async (req, res) => {
  const { table_id } = req.body;

  const day = await get("SELECT id FROM register_days WHERE status = 'open' AND tenant_id = $1", [req.tenantId]);
  if (!day) {
    return res.status(400).json({ error: 'Откройте кассовый день' });
  }

  if (table_id) {
    const existing = await get("SELECT id FROM orders WHERE table_id = $1 AND status = 'open' AND tenant_id = $2", [table_id, req.tenantId]);
    if (existing) {
      return res.status(400).json({ error: 'На этом столике уже есть открытый заказ', order_id: existing.id });
    }
  }

  const result = await run(
    'INSERT INTO orders (table_id, register_day_id, user_id, tenant_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [table_id || null, day.id, req.user.id, req.tenantId]
  );
  const order = await get('SELECT * FROM orders WHERE id = $1', [result.id]);
  if (!order) {
    return res.status(500).json({ error: 'Не удалось создать заказ' });
  }
  order.items = [];
  res.json(order);
});

router.post('/:id/items', async (req, res) => {
  const { product_id, quantity } = req.body;
  const order = await get("SELECT * FROM orders WHERE id = $1 AND status = 'open' AND tenant_id = $2", [req.params.id, req.tenantId]);
  if (!order) return res.status(400).json({ error: 'Заказ не найден или уже закрыт' });

  const product = await get('SELECT * FROM products WHERE id = $1 AND active = true AND tenant_id = $2', [product_id, req.tenantId]);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });

  const qty = quantity || 1;

  const existingItem = await get('SELECT * FROM order_items WHERE order_id = $1 AND product_id = $2', [order.id, product_id]);
  if (existingItem) {
    const newQty = existingItem.quantity + qty;
    if (newQty <= 0) {
      await run('DELETE FROM order_items WHERE id = $1', [existingItem.id]);
    } else {
      await run(
        'UPDATE order_items SET quantity = $1, total = $2 WHERE id = $3',
        [newQty, newQty * parseFloat(existingItem.price), existingItem.id]
      );
    }
  } else if (qty > 0) {
    let costPrice = parseFloat(product.cost_price);
    if (product.is_composite) {
      const ingredients = await all(
        'SELECT pi.amount, p.cost_price FROM product_ingredients pi JOIN products p ON pi.ingredient_id = p.id WHERE pi.product_id = $1',
        [product.id]
      );
      costPrice = ingredients.reduce((sum, i) => sum + parseFloat(i.amount) * parseFloat(i.cost_price), 0);
    }

    await run(
      'INSERT INTO order_items (order_id, product_id, product_name, quantity, price, cost_price, total) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [order.id, product_id, product.name, qty, product.price, costPrice, qty * parseFloat(product.price)]
    );
  }

  const totalRow = await get('SELECT COALESCE(SUM(total), 0) as total FROM order_items WHERE order_id = $1', [order.id]);
  await run('UPDATE orders SET total = $1 WHERE id = $2', [totalRow.total, order.id]);

  const updated = await get('SELECT * FROM orders WHERE id = $1', [order.id]);
  updated.items = await all('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  res.json(updated);
});

router.put('/:id/items/:itemId', async (req, res) => {
  const { quantity } = req.body;
  const item = await get('SELECT * FROM order_items WHERE id = $1 AND order_id = $2', [req.params.itemId, req.params.id]);
  if (!item) return res.status(404).json({ error: 'Позиция не найдена' });

  if (quantity <= 0) {
    await run('DELETE FROM order_items WHERE id = $1', [item.id]);
  } else {
    await run('UPDATE order_items SET quantity = $1, total = $2 WHERE id = $3', [quantity, quantity * parseFloat(item.price), item.id]);
  }

  const totalRow = await get('SELECT COALESCE(SUM(total), 0) as total FROM order_items WHERE order_id = $1', [req.params.id]);
  await run('UPDATE orders SET total = $1 WHERE id = $2', [totalRow.total, req.params.id]);

  const updated = await get('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  updated.items = await all('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
  res.json(updated);
});

router.delete('/:id/items/:itemId', async (req, res) => {
  // Verify order belongs to tenant
  const order = await get('SELECT id FROM orders WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });

  await run('DELETE FROM order_items WHERE id = $1 AND order_id = $2', [req.params.itemId, req.params.id]);
  const totalRow = await get('SELECT COALESCE(SUM(total), 0) as total FROM order_items WHERE order_id = $1', [req.params.id]);
  await run('UPDATE orders SET total = $1 WHERE id = $2', [totalRow.total, req.params.id]);
  const updated = await get('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  updated.items = await all('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
  res.json(updated);
});

router.post('/:id/close', async (req, res) => {
  const { payment_method } = req.body;
  const order = await get("SELECT * FROM orders WHERE id = $1 AND status = 'open' AND tenant_id = $2", [req.params.id, req.tenantId]);
  if (!order) return res.status(400).json({ error: 'Заказ не найден или уже закрыт' });

  if (!payment_method) return res.status(400).json({ error: 'Выберите способ оплаты' });

  const items = await all('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  if (items.length === 0) return res.status(400).json({ error: 'Заказ пуст' });

  await transaction(async (tx) => {
    // Deduct inventory
    for (const item of items) {
      const product = await tx.get('SELECT * FROM products WHERE id = $1', [item.product_id]);
      if (!product) continue;

      if (product.is_composite) {
        const ingredients = await tx.all('SELECT * FROM product_ingredients WHERE product_id = $1', [product.id]);
        for (const ing of ingredients) {
          const ingProduct = await tx.get('SELECT * FROM products WHERE id = $1', [ing.ingredient_id]);
          if (ingProduct && ingProduct.track_inventory) {
            await tx.run('UPDATE products SET quantity = quantity - $1 WHERE id = $2',
              [parseFloat(ing.amount) * item.quantity, ing.ingredient_id]);
          }
        }
      } else if (product.track_inventory) {
        await tx.run('UPDATE products SET quantity = quantity - $1 WHERE id = $2',
          [item.quantity, product.id]);
      }
    }

    // Update order
    await tx.run(
      "UPDATE orders SET status = 'closed', payment_method = $1, closed_at = NOW() WHERE id = $2",
      [payment_method, order.id]
    );

    // Update register day totals
    const day = await tx.get('SELECT * FROM register_days WHERE id = $1', [order.register_day_id]);
    if (day) {
      if (payment_method === 'cash') {
        await tx.run(
          'UPDATE register_days SET total_cash = total_cash + $1, expected_cash = expected_cash + $2, total_sales = total_sales + $3 WHERE id = $4',
          [order.total, order.total, order.total, day.id]
        );
      } else {
        await tx.run(
          'UPDATE register_days SET total_card = total_card + $1, total_sales = total_sales + $2 WHERE id = $3',
          [order.total, order.total, day.id]
        );
      }
    }
  });

  const updated = await get('SELECT * FROM orders WHERE id = $1', [order.id]);
  updated.items = items;
  res.json(updated);
});

router.post('/:id/cancel', async (req, res) => {
  const order = await get("SELECT * FROM orders WHERE id = $1 AND status = 'open' AND tenant_id = $2", [req.params.id, req.tenantId]);
  if (!order) return res.status(400).json({ error: 'Заказ не найден или уже закрыт' });

  await run("UPDATE orders SET status = 'cancelled' WHERE id = $1", [order.id]);
  res.json({ success: true });
});

module.exports = router;
