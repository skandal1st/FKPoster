const express = require('express');
const { all, get, run, transaction } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription, checkFeature } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, adminOnly, checkSubscription, checkFeature('inventory'));

router.get('/', async (req, res) => {
  const supplies = await all(
    'SELECT s.*, u.name as user_name FROM supplies s LEFT JOIN users u ON s.user_id = u.id WHERE s.tenant_id = $1 ORDER BY s.id DESC',
    [req.tenantId]
  );
  for (const s of supplies) {
    s.items = await all(`
      SELECT si.*, p.name as product_name, p.unit
      FROM supply_items si JOIN products p ON si.product_id = p.id
      WHERE si.supply_id = $1
    `, [s.id]);
  }
  res.json(supplies);
});

router.post('/', async (req, res) => {
  const { supplier, note, items, counterparty_id, edo_document_id, egais_document_id, chain_transfer_id } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Добавьте хотя бы одну позицию' });
  }

  const result = await transaction(async (tx) => {
    let total = 0;
    for (const item of items) {
      total += item.quantity * item.unit_cost;
    }

    const supplyRes = await tx.run(
      `INSERT INTO supplies (supplier, note, total, user_id, tenant_id, counterparty_id, edo_document_id, egais_document_id, chain_transfer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [supplier || '', note || '', total, req.user.id, req.tenantId,
       counterparty_id || null, edo_document_id || null, egais_document_id || null, chain_transfer_id || null]
    );
    const supplyId = supplyRes.id;

    for (const item of items) {
      // Определяем тип маркировки товара
      const productInfo = await tx.get('SELECT marking_type FROM products WHERE id = $1 AND tenant_id = $2', [item.product_id, req.tenantId]);
      const markingType = productInfo?.marking_type || 'none';
      const expectedMarkedCount = markingType !== 'none' ? Math.ceil(item.quantity) : 0;

      await tx.run(
        'INSERT INTO supply_items (supply_id, product_id, quantity, unit_cost, marking_type, expected_marked_count) VALUES ($1, $2, $3, $4, $5, $6)',
        [supplyId, item.product_id, item.quantity, item.unit_cost, markingType, expectedMarkedCount]
      );

      const product = await tx.get('SELECT quantity, cost_price FROM products WHERE id = $1 AND tenant_id = $2', [item.product_id, req.tenantId]);
      if (product) {
        const oldQty = parseFloat(product.quantity);
        const oldCost = parseFloat(product.cost_price);
        const newQty = item.quantity;
        const newUnitCost = item.unit_cost;
        const totalQty = oldQty + newQty;
        const newCostPrice = totalQty > 0
          ? (oldQty * oldCost + newQty * newUnitCost) / totalQty
          : newUnitCost;

        await tx.run(
          'UPDATE products SET quantity = $1, cost_price = $2 WHERE id = $3 AND tenant_id = $4',
          [totalQty, Math.round(newCostPrice * 100) / 100, item.product_id, req.tenantId]
        );
      }
    }

    return { id: supplyId, total };
  });

  res.json(result);
});

module.exports = router;
