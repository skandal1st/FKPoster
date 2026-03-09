const express = require('express');
const { all, get, run, transaction } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { checkSubscription, checkLimit } = require('../middleware/subscription');
const { loadIntegrations } = require('../middleware/integration');
const { emitEvent } = require('../utils/emitEvent');
const { invalidateResourceCount } = require('../cache');

const router = express.Router();
router.use(authMiddleware, checkSubscription, loadIntegrations);

router.get('/', async (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT o.*, t.number as table_number, t.label as table_label, h.name as hall_name, u.name as user_name, g.name as guest_name
    FROM orders o
    LEFT JOIN tables t ON o.table_id = t.id
    LEFT JOIN halls h ON t.hall_id = h.id
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN guests g ON o.guest_id = g.id
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
    SELECT o.*, t.number as table_number, t.label as table_label, h.name as hall_name,
           g.name as guest_name, g.discount_type as guest_discount_type, g.discount_value as guest_discount_value
    FROM orders o
    LEFT JOIN tables t ON o.table_id = t.id
    LEFT JOIN halls h ON t.hall_id = h.id
    LEFT JOIN guests g ON o.guest_id = g.id
    WHERE o.id = $1 AND o.tenant_id = $2
  `, [req.params.id, req.tenantId]);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  order.items = await all(`
    SELECT oi.*, c.name as category_name, w.name as workshop_name, w.id as workshop_id
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN workshops w ON c.workshop_id = w.id
    WHERE oi.order_id = $1
  `, [order.id]);

  // Подтянуть последний ККТ-чек
  const kktReceipt = await get(
    'SELECT id, status, fiscal_number, fiscal_document, fiscal_sign, receipt_datetime, error_message FROM kkt_receipts WHERE order_id = $1 AND tenant_id = $2 ORDER BY id DESC LIMIT 1',
    [order.id, req.tenantId]
  );
  if (kktReceipt) {
    order.kkt_receipt_data = kktReceipt;
  }

  res.json(order);
});

router.post('/', checkLimit('orders'), async (req, res) => {
  const { table_id } = req.body;

  const day = await get("SELECT id FROM register_days WHERE status = 'open' AND tenant_id = $1", [req.tenantId]);
  if (!day) {
    return res.status(400).json({ error: 'Откройте кассовый день' });
  }

  if (table_id) {
    // Check if table's hall is locked by plan
    const maxHalls = req.plan?.max_halls;
    if (maxHalls) {
      const table = await get('SELECT hall_id FROM tables WHERE id = $1 AND tenant_id = $2', [table_id, req.tenantId]);
      if (table && table.hall_id) {
        const hallIds = await all(
          'SELECT id FROM halls WHERE active = true AND tenant_id = $1 ORDER BY id',
          [req.tenantId]
        );
        const allowedIds = hallIds.slice(0, maxHalls).map((h) => h.id);
        if (!allowedIds.includes(table.hall_id)) {
          return res.status(403).json({ error: 'Зал заблокирован по лимиту тарифа. Обновите план.' });
        }
      }
    }

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
  invalidateResourceCount(req.tenantId, 'orders');
  emitEvent(req, 'order:created', order);
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
        'SELECT pi.amount, pi.ingredient_id, pi.ingredient_group_id, p.cost_price FROM product_ingredients pi LEFT JOIN products p ON pi.ingredient_id = p.id WHERE pi.product_id = $1',
        [product.id]
      );
      costPrice = 0;
      for (const i of ingredients) {
        if (i.ingredient_group_id) {
          const avgCost = await get(
            `SELECT CASE WHEN SUM(quantity) > 0
               THEN SUM(quantity * cost_price) / SUM(quantity) ELSE 0 END as avg_cost
             FROM products WHERE ingredient_group_id = $1 AND active = true`,
            [i.ingredient_group_id]
          );
          costPrice += parseFloat(i.amount) * (parseFloat(avgCost.avg_cost) || 0);
        } else if (i.cost_price) {
          costPrice += parseFloat(i.amount) * parseFloat(i.cost_price);
        }
      }
    }

    const markingType = product.marking_type || 'none';
    const markedCodesRequired = markingType !== 'none' ? qty : 0;

    await run(
      'INSERT INTO order_items (order_id, product_id, product_name, quantity, price, cost_price, total, marking_type, marked_codes_required) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [order.id, product_id, product.name, qty, product.price, costPrice, qty * parseFloat(product.price), markingType, markedCodesRequired]
    );
  }

  const totalRow = await get('SELECT COALESCE(SUM(total), 0) as total FROM order_items WHERE order_id = $1', [order.id]);
  await run('UPDATE orders SET total = $1 WHERE id = $2', [totalRow.total, order.id]);

  const updated = await get('SELECT * FROM orders WHERE id = $1', [order.id]);
  updated.items = await all('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  emitEvent(req, 'order:updated', updated);
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
  emitEvent(req, 'order:updated', updated);
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
  emitEvent(req, 'order:updated', updated);
  res.json(updated);
});

router.post('/:id/close', async (req, res) => {
  const { payment_method, guest_id, paid_cash, paid_card } = req.body;
  const order = await get("SELECT * FROM orders WHERE id = $1 AND status = 'open' AND tenant_id = $2", [req.params.id, req.tenantId]);
  if (!order) return res.status(400).json({ error: 'Заказ не найден или уже закрыт' });

  if (!payment_method || !['cash', 'card', 'mixed'].includes(payment_method)) {
    return res.status(400).json({ error: 'Выберите способ оплаты' });
  }

  const items = await all('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  if (items.length === 0) return res.status(400).json({ error: 'Заказ пуст' });

  const totalBeforeDiscount = items.reduce((sum, i) => sum + parseFloat(i.total || 0), 0);
  let discountAmount = 0;
  let finalGuestId = null;

  if (guest_id) {
    const guest = await get('SELECT * FROM guests WHERE id = $1 AND tenant_id = $2 AND active = true', [guest_id, req.tenantId]);
    if (guest) {
      finalGuestId = guest.id;
      if (guest.discount_type === 'percent') {
        const pct = Math.min(100, Math.max(0, parseFloat(guest.discount_value) || 0));
        discountAmount = Math.round((totalBeforeDiscount * pct / 100) * 100) / 100;
      } else {
        discountAmount = Math.min(totalBeforeDiscount, Math.max(0, parseFloat(guest.discount_value) || 0));
      }
    }
  }

  const totalToPay = Math.max(0, totalBeforeDiscount - discountAmount);

  // Расчёт paid_cash / paid_card
  let finalPaidCash = 0;
  let finalPaidCard = 0;
  if (payment_method === 'cash') {
    finalPaidCash = totalToPay;
  } else if (payment_method === 'card') {
    finalPaidCard = totalToPay;
  } else if (payment_method === 'mixed') {
    finalPaidCash = parseFloat(paid_cash) || 0;
    finalPaidCard = parseFloat(paid_card) || 0;
    if (finalPaidCash < 0 || finalPaidCard < 0) {
      return res.status(400).json({ error: 'Суммы оплаты не могут быть отрицательными' });
    }
    const sum = Math.round((finalPaidCash + finalPaidCard) * 100) / 100;
    const expected = Math.round(totalToPay * 100) / 100;
    if (sum !== expected) {
      return res.status(400).json({ error: `Сумма наличных и карты (${sum}) не совпадает с суммой к оплате (${expected})` });
    }
  }

  // === ККТ строгий режим: фискализация ДО закрытия ===
  let kktResult = null;
  if (req.integrations?.kkt_enabled && req.integrations?.kkt_provider && req.integrations.kkt_strict_mode) {
    const KktService = require('../services/kkt');
    const kkt = new KktService(req.tenantId, req.integrations);
    const receiptItems = await all(
      'SELECT oi.*, p.vat_rate FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1',
      [order.id]
    );
    kktResult = await kkt.createSellReceipt(
      { orderId: order.id, total: totalToPay, paidCash: finalPaidCash, paidCard: finalPaidCard },
      receiptItems, req.user.name
    );
    if (!kktResult.success) {
      return res.status(502).json({
        error: `Ошибка фискализации: ${kktResult.error}. Заказ не закрыт.`,
        kkt_error: true,
      });
    }
  }

  // Проверка маркировки: если интеграция включена и есть маркированные позиции
  const hasIntegration = req.integrations && (req.integrations.egais_enabled || req.integrations.chestniy_znak_enabled);
  if (hasIntegration) {
    const markedItems = items.filter((i) => i.marking_type && i.marking_type !== 'none');
    for (const mi of markedItems) {
      if (mi.marked_codes_scanned < mi.marked_codes_required) {
        return res.status(400).json({
          error: `Не все коды маркировки отсканированы для "${mi.product_name}". Отсканировано: ${mi.marked_codes_scanned} из ${mi.marked_codes_required}`,
          requires_marking: true,
        });
      }
    }
  }

  await transaction(async (tx) => {
    // Deduct inventory
    for (const item of items) {
      const product = await tx.get('SELECT * FROM products WHERE id = $1', [item.product_id]);
      if (!product) continue;

      if (product.is_composite) {
        const ingredients = await tx.all('SELECT * FROM product_ingredients WHERE product_id = $1', [product.id]);
        for (const ing of ingredients) {
          if (ing.ingredient_group_id) {
            // Пропорциональное списание из группы
            const members = await tx.all(
              'SELECT id, quantity FROM products WHERE ingredient_group_id = $1 AND active = true AND quantity > 0',
              [ing.ingredient_group_id]
            );
            const totalStock = members.reduce((s, m) => s + parseFloat(m.quantity), 0);
            const toDeduct = parseFloat(ing.amount) * item.quantity;
            if (totalStock > 0) {
              for (const member of members) {
                const share = (parseFloat(member.quantity) / totalStock) * toDeduct;
                if (share > 0) {
                  await tx.run('UPDATE products SET quantity = quantity - $1 WHERE id = $2', [share, member.id]);
                }
              }
            }
          } else if (ing.ingredient_id) {
            const ingProduct = await tx.get('SELECT * FROM products WHERE id = $1', [ing.ingredient_id]);
            if (ingProduct && ingProduct.track_inventory) {
              await tx.run('UPDATE products SET quantity = quantity - $1 WHERE id = $2',
                [parseFloat(ing.amount) * item.quantity, ing.ingredient_id]);
            }
          }
        }
      } else if (product.track_inventory) {
        await tx.run('UPDATE products SET quantity = quantity - $1 WHERE id = $2',
          [item.quantity, product.id]);
      }
    }

    // Update order: итог к оплате, скидка, гость, paid_cash/paid_card
    await tx.run(
      `UPDATE orders SET status = 'closed', payment_method = $1, closed_at = NOW(),
       total = $2, discount_amount = $3, total_before_discount = $4, guest_id = $5,
       paid_cash = $6, paid_card = $7 WHERE id = $8`,
      [payment_method, totalToPay, discountAmount, totalBeforeDiscount, finalGuestId, finalPaidCash, finalPaidCard, order.id]
    );

    // Update register day totals (учитываем фактическую сумму к оплате)
    const day = await tx.get('SELECT * FROM register_days WHERE id = $1', [order.register_day_id]);
    if (day) {
      await tx.run(
        `UPDATE register_days SET
          total_cash = total_cash + $1,
          total_card = total_card + $2,
          expected_cash = expected_cash + $3,
          total_sales = total_sales + $4
        WHERE id = $5`,
        [finalPaidCash, finalPaidCard, finalPaidCash, totalToPay, day.id]
      );
    }
  });

  // === ККТ мягкий режим: фискализация ПОСЛЕ закрытия ===
  if (req.integrations?.kkt_enabled && req.integrations?.kkt_provider && !req.integrations.kkt_strict_mode) {
    try {
      const KktService = require('../services/kkt');
      const kkt = new KktService(req.tenantId, req.integrations);
      const receiptItems = await all(
        'SELECT oi.*, p.vat_rate FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1',
        [order.id]
      );
      kktResult = await kkt.createSellReceipt(
        { orderId: order.id, total: totalToPay, paidCash: finalPaidCash, paidCard: finalPaidCard },
        receiptItems, req.user.name
      );
    } catch (err) {
      console.error('KKT soft mode error:', err.message);
    }
  }

  const updated = await get(`
    SELECT o.*, t.number as table_number, t.label as table_label, h.name as hall_name,
           g.name as guest_name, g.discount_type as guest_discount_type, g.discount_value as guest_discount_value
    FROM orders o
    LEFT JOIN tables t ON o.table_id = t.id
    LEFT JOIN halls h ON t.hall_id = h.id
    LEFT JOIN guests g ON o.guest_id = g.id
    WHERE o.id = $1
  `, [order.id]);
  updated.items = await all(`
    SELECT oi.*, c.name as category_name, w.name as workshop_name, w.id as workshop_id
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN workshops w ON c.workshop_id = w.id
    WHERE oi.order_id = $1
  `, [order.id]);

  // Добавить данные ККТ-чека в ответ
  if (kktResult) {
    updated.kkt_receipt = kktResult;
  }

  emitEvent(req, 'order:closed', updated);
  res.json(updated);
});

router.post('/:id/cancel', async (req, res) => {
  const order = await get("SELECT * FROM orders WHERE id = $1 AND status = 'open' AND tenant_id = $2", [req.params.id, req.tenantId]);
  if (!order) return res.status(400).json({ error: 'Заказ не найден или уже закрыт' });

  await run("UPDATE orders SET status = 'cancelled' WHERE id = $1", [order.id]);
  emitEvent(req, 'order:cancelled', { id: order.id });
  res.json({ success: true });
});

/**
 * Изменить способ оплаты у закрытого заказа.
 * Пересчитывает итоги кассового дня (total_cash / total_card).
 */
router.patch('/:id/payment-method', async (req, res) => {
  const { payment_method, paid_cash, paid_card } = req.body;
  if (!payment_method || !['cash', 'card', 'mixed'].includes(payment_method)) {
    return res.status(400).json({ error: 'Укажите способ оплаты: cash, card или mixed' });
  }

  const order = await get(
    "SELECT * FROM orders WHERE id = $1 AND status = 'closed' AND tenant_id = $2",
    [req.params.id, req.tenantId]
  );
  if (!order) return res.status(404).json({ error: 'Заказ не найден или не закрыт' });

  const total = parseFloat(order.total) || 0;
  const oldPaidCash = parseFloat(order.paid_cash) || 0;
  const oldPaidCard = parseFloat(order.paid_card) || 0;

  // Вычислить новые суммы
  let newPaidCash = 0;
  let newPaidCard = 0;
  if (payment_method === 'cash') {
    newPaidCash = total;
  } else if (payment_method === 'card') {
    newPaidCard = total;
  } else if (payment_method === 'mixed') {
    newPaidCash = parseFloat(paid_cash) || 0;
    newPaidCard = parseFloat(paid_card) || 0;
    if (newPaidCash < 0 || newPaidCard < 0) {
      return res.status(400).json({ error: 'Суммы оплаты не могут быть отрицательными' });
    }
    const sum = Math.round((newPaidCash + newPaidCard) * 100) / 100;
    const expected = Math.round(total * 100) / 100;
    if (sum !== expected) {
      return res.status(400).json({ error: `Сумма наличных и карты (${sum}) не совпадает с суммой заказа (${expected})` });
    }
  }

  await transaction(async (tx) => {
    await tx.run(
      'UPDATE orders SET payment_method = $1, paid_cash = $2, paid_card = $3 WHERE id = $4',
      [payment_method, newPaidCash, newPaidCard, order.id]
    );

    const day = await tx.get('SELECT * FROM register_days WHERE id = $1', [order.register_day_id]);
    if (!day) return;

    // Дельта-подход: разница между старыми и новыми суммами
    const cashDelta = newPaidCash - oldPaidCash;
    const cardDelta = newPaidCard - oldPaidCard;

    await tx.run(
      `UPDATE register_days SET
        total_cash = GREATEST(0, total_cash + $1),
        total_card = GREATEST(0, total_card + $2),
        expected_cash = GREATEST(0, expected_cash + $3)
      WHERE id = $4`,
      [cashDelta, cardDelta, cashDelta, day.id]
    );
  });

  const updated = await get(
    'SELECT o.*, t.number as table_number, t.label as table_label, h.name as hall_name FROM orders o LEFT JOIN tables t ON o.table_id = t.id LEFT JOIN halls h ON t.hall_id = h.id WHERE o.id = $1',
    [order.id]
  );
  emitEvent(req, 'order:updated', updated);
  res.json(updated);
});

module.exports = router;
