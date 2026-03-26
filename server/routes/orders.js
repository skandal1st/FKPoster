const express = require('express');
const { all, get, run, transaction } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { checkSubscription, checkLimit } = require('../middleware/subscription');
const { loadIntegrations } = require('../middleware/integration');
const { emitEvent } = require('../utils/emitEvent');
const { invalidateResourceCount } = require('../cache');

const router = express.Router();
router.use(authMiddleware, checkSubscription, loadIntegrations);

// Подгрузить модификаторы для массива order_items
async function loadItemModifiers(items) {
  for (const item of items) {
    item.modifiers = await all(
      'SELECT * FROM order_item_modifiers WHERE order_item_id = $1',
      [item.id]
    );
  }
}

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

  // Подтянуть модификаторы для каждой позиции
  for (const item of order.items) {
    item.modifiers = await all(
      'SELECT * FROM order_item_modifiers WHERE order_item_id = $1',
      [item.id]
    );
  }

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
  const { table_id, idempotency_key, order_type } = req.body;

  // Idempotency: проверка дубля (для офлайн-синхронизации)
  if (idempotency_key) {
    const existing = await get(
      'SELECT id FROM orders WHERE idempotency_key = $1 AND tenant_id = $2',
      [idempotency_key, req.tenantId]
    );
    if (existing) {
      const existingOrder = await get('SELECT * FROM orders WHERE id = $1', [existing.id]);
      existingOrder.items = await all('SELECT * FROM order_items WHERE order_id = $1', [existing.id]);
      return res.json(existingOrder);
    }
  }

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

  // Тип заказа для FastPOS (dine_in / take_away / delivery)
  const validOrderTypes = ['dine_in', 'take_away', 'delivery'];
  const oType = validOrderTypes.includes(order_type) ? order_type : 'dine_in';

  const result = await run(
    'INSERT INTO orders (table_id, register_day_id, user_id, tenant_id, idempotency_key, order_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [table_id || null, day.id, req.user.id, req.tenantId, idempotency_key || null, oType]
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
  const { product_id, quantity, modifiers } = req.body;
  const order = await get("SELECT * FROM orders WHERE id = $1 AND status = 'open' AND tenant_id = $2", [req.params.id, req.tenantId]);
  if (!order) return res.status(400).json({ error: 'Заказ не найден или уже закрыт' });

  const product = await get('SELECT * FROM products WHERE id = $1 AND active = true AND tenant_id = $2', [product_id, req.tenantId]);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });

  const qty = quantity || 1;
  const hasModifiers = modifiers && modifiers.length > 0;

  // Если есть модификаторы — всегда новая позиция (разные комбинации = разные строки)
  const existingItem = hasModifiers ? null : await get('SELECT * FROM order_items WHERE order_id = $1 AND product_id = $2', [order.id, product_id]);
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

    // Расчёт доплаты модификаторов
    let modSurcharge = 0;
    let modCostSurcharge = 0;
    const resolvedModifiers = [];
    if (hasModifiers) {
      for (const m of modifiers) {
        const mod = await get('SELECT * FROM modifiers WHERE id = $1 AND tenant_id = $2 AND active = true', [m.modifier_id, req.tenantId]);
        if (mod) {
          const mQty = m.quantity || 1;
          modSurcharge += parseFloat(mod.price) * mQty;
          modCostSurcharge += parseFloat(mod.cost_price) * mQty;
          resolvedModifiers.push({ modifier_id: mod.id, name: mod.name, price: parseFloat(mod.price), quantity: mQty });
        }
      }
    }

    const itemPrice = parseFloat(product.price) + modSurcharge;
    const itemCost = costPrice + modCostSurcharge;

    const markingType = product.marking_type || 'none';
    const markedCodesRequired = markingType !== 'none' ? qty : 0;

    const itemResult = await run(
      'INSERT INTO order_items (order_id, product_id, product_name, quantity, price, cost_price, total, marking_type, marked_codes_required) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [order.id, product_id, product.name, qty, itemPrice, itemCost, qty * itemPrice, markingType, markedCodesRequired]
    );

    // Сохранить модификаторы позиции
    if (resolvedModifiers.length > 0) {
      for (const rm of resolvedModifiers) {
        await run(
          'INSERT INTO order_item_modifiers (order_item_id, modifier_id, modifier_name, price, quantity) VALUES ($1, $2, $3, $4, $5)',
          [itemResult.id, rm.modifier_id, rm.name, rm.price, rm.quantity]
        );
      }
    }
  }

  const totalRow = await get('SELECT COALESCE(SUM(total), 0) as total FROM order_items WHERE order_id = $1', [order.id]);
  await run('UPDATE orders SET total = $1 WHERE id = $2', [totalRow.total, order.id]);

  const updated = await get('SELECT * FROM orders WHERE id = $1', [order.id]);
  updated.items = await all('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  await loadItemModifiers(updated.items);
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
    // price уже включает модификаторы (записана при создании позиции)
    await run('UPDATE order_items SET quantity = $1, total = $2 WHERE id = $3', [quantity, quantity * parseFloat(item.price), item.id]);
  }

  const totalRow = await get('SELECT COALESCE(SUM(total), 0) as total FROM order_items WHERE order_id = $1', [req.params.id]);
  await run('UPDATE orders SET total = $1 WHERE id = $2', [totalRow.total, req.params.id]);

  const updated = await get('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  updated.items = await all('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
  await loadItemModifiers(updated.items);
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
  await loadItemModifiers(updated.items);
  emitEvent(req, 'order:updated', updated);
  res.json(updated);
});

router.post('/:id/close', async (req, res) => {
  const { payment_method, guest_id, paid_cash, paid_card, bonus_spend } = req.body;
  const order = await get("SELECT * FROM orders WHERE id = $1 AND status = 'open' AND tenant_id = $2", [req.params.id, req.tenantId]);
  if (!order) return res.status(400).json({ error: 'Заказ не найден или уже закрыт' });

  if (!payment_method || !['cash', 'card', 'mixed', 'delivery'].includes(payment_method)) {
    return res.status(400).json({ error: 'Выберите способ оплаты' });
  }

  const items = await all('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  if (items.length === 0) return res.status(400).json({ error: 'Заказ пуст' });

  const totalBeforeDiscount = items.reduce((sum, i) => sum + parseFloat(i.total || 0), 0);
  let discountAmount = 0;
  let finalGuestId = null;
  let guestForBonus = null;

  if (guest_id) {
    const guest = await get('SELECT * FROM guests WHERE id = $1 AND tenant_id = $2 AND active = true', [guest_id, req.tenantId]);
    if (guest) {
      guestForBonus = guest;
      finalGuestId = guest.id;
      if (guest.discount_type === 'percent') {
        const pct = Math.min(100, Math.max(0, parseFloat(guest.discount_value) || 0));
        discountAmount = Math.round((totalBeforeDiscount * pct / 100) * 100) / 100;
      } else {
        discountAmount = Math.min(totalBeforeDiscount, Math.max(0, parseFloat(guest.discount_value) || 0));
      }
    }
  }

  // Расчёт бонусов: списание и начисление
  let bonusUsed = 0;
  let bonusEarned = 0;
  if (guestForBonus) {
    const afterDiscount = totalBeforeDiscount - discountAmount;
    const requestedSpend = Math.max(0, parseFloat(bonus_spend) || 0);
    bonusUsed = Math.floor(
      Math.min(requestedSpend, parseFloat(guestForBonus.bonus_balance) || 0, afterDiscount) * 100
    ) / 100;

    const tiers = await all(
      'SELECT * FROM loyalty_tiers WHERE tenant_id = $1 ORDER BY min_spent ASC',
      [req.tenantId]
    );
    const { resolveGuestBonusRate } = require('../utils/resolveGuestBonusRate');
    const bonusRate = resolveGuestBonusRate(guestForBonus, tiers);
    const paidWithMoney = afterDiscount - bonusUsed;
    bonusEarned = Math.floor(paidWithMoney * bonusRate / 100 * 100) / 100;
  }

  const totalToPay = Math.max(0, totalBeforeDiscount - discountAmount - bonusUsed);

  // Расчёт paid_cash / paid_card
  let finalPaidCash = 0;
  let finalPaidCard = 0;
  if (payment_method === 'cash') {
    finalPaidCash = totalToPay;
  } else if (payment_method === 'card') {
    finalPaidCard = totalToPay;
  } else if (payment_method === 'delivery') {
    // Доставка — оплата через службу доставки, не наличные/карта
    finalPaidCash = 0;
    finalPaidCard = 0;
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

  // Контакт покупателя для чека ККТ (54-ФЗ)
  let clientPhone = null;
  if (finalGuestId) {
    const guestRow = await get('SELECT phone FROM guests WHERE id = $1', [finalGuestId]);
    if (guestRow?.phone) clientPhone = guestRow.phone;
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
      { orderId: order.id, total: totalToPay, paidCash: finalPaidCash, paidCard: finalPaidCard, clientPhone },
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

    // Списание ингредиентов модификаторов
    const allItemModifiers = await tx.all(`
      SELECT oim.*, oi.quantity as item_qty
      FROM order_item_modifiers oim
      JOIN order_items oi ON oim.order_item_id = oi.id
      WHERE oi.order_id = $1
    `, [order.id]);
    for (const oim of allItemModifiers) {
      if (!oim.modifier_id) continue;
      const mod = await tx.get('SELECT ingredient_id FROM modifiers WHERE id = $1', [oim.modifier_id]);
      if (mod?.ingredient_id) {
        const ing = await tx.get('SELECT track_inventory FROM products WHERE id = $1', [mod.ingredient_id]);
        if (ing?.track_inventory) {
          await tx.run('UPDATE products SET quantity = quantity - $1 WHERE id = $2',
            [oim.quantity * oim.item_qty, mod.ingredient_id]);
        }
      }
    }

    // Update order: итог к оплате, скидка, гость, paid_cash/paid_card, бонусы
    await tx.run(
      `UPDATE orders SET status = 'closed', payment_method = $1, closed_at = NOW(),
       total = $2, discount_amount = $3, total_before_discount = $4, guest_id = $5,
       paid_cash = $6, paid_card = $7, bonus_used = $8, bonus_earned = $9 WHERE id = $10`,
      [payment_method, totalToPay, discountAmount, totalBeforeDiscount, finalGuestId, finalPaidCash, finalPaidCard, bonusUsed, bonusEarned, order.id]
    );

    // Обновить бонусный баланс и статистику гостя
    if (finalGuestId) {
      await tx.run(
        `UPDATE guests SET
          bonus_balance = GREATEST(0, bonus_balance - $1 + $2),
          total_spent = total_spent + $3,
          visits_count = visits_count + 1,
          updated_at = NOW()
        WHERE id = $4 AND tenant_id = $5`,
        [bonusUsed, bonusEarned, totalToPay, finalGuestId, req.tenantId]
      );
    }

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
        { orderId: order.id, total: totalToPay, paidCash: finalPaidCash, paidCard: finalPaidCard, clientPhone },
        receiptItems, req.user.name
      );
    } catch (err) {
      console.error('KKT soft mode error:', err.message);
    }
  }

  // === Физическая ККТ: постановка чека в очередь ===
  if (req.integrations?.kkt_physical_enabled) {
    try {
      // Найти активное устройство тенанта
      const device = await get(
        `SELECT device_id FROM kkt_physical_devices
         WHERE tenant_id = $1 AND status = 'online'
         ORDER BY last_seen_at DESC LIMIT 1`,
        [req.tenantId]
      );

      if (device) {
        // Получить позиции с VAT для чека
        const receiptItems = await all(
          'SELECT oi.*, p.vat_rate FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1',
          [order.id]
        );

        const receiptData = {
          items: receiptItems.map(i => ({
            name: i.product_name,
            price: parseFloat(i.price),
            quantity: parseFloat(i.quantity),
            amount: parseFloat(i.total),
            vat: i.vat_rate || 'none'
          })),
          total: totalToPay,
          paid_cash: finalPaidCash,
          paid_card: finalPaidCard,
          payment_method,
          operator_name: req.user.name
        };

        const queueResult = await get(
          `INSERT INTO kkt_physical_queue (tenant_id, order_id, device_id, receipt_type, receipt_data)
           VALUES ($1, $2, $3, 'sell', $4) RETURNING id`,
          [req.tenantId, order.id, device.device_id, JSON.stringify(receiptData)]
        );

        // Уведомить bridge-устройство по socket
        const io = req.app.get('io');
        if (io) {
          io.to(`device:${device.device_id}`).emit('fiscal:print', {
            queue_id: queueResult.id,
            receipt_type: 'sell',
            receipt_data: receiptData
          });
        }

        console.log(`[PHYSICAL_KKT] Чек заказа #${order.id} поставлен в очередь #${queueResult.id} для устройства ${device.device_id}`);
      } else {
        console.warn(`[PHYSICAL_KKT] Нет активных устройств для тенанта ${req.tenantId}`);
      }
    } catch (err) {
      console.error('[PHYSICAL_KKT] Ошибка постановки чека в очередь:', err.message);
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
  await loadItemModifiers(updated.items);

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
 * Пересадить заказ на другой стол.
 */
router.patch('/:id/move', async (req, res) => {
  const { table_id } = req.body;
  if (!table_id) {
    return res.status(400).json({ error: 'Укажите новый стол' });
  }

  const order = await get(
    "SELECT * FROM orders WHERE id = $1 AND status = 'open' AND tenant_id = $2",
    [req.params.id, req.tenantId]
  );
  if (!order) return res.status(404).json({ error: 'Заказ не найден или уже закрыт' });

  if (order.table_id === table_id) {
    return res.status(400).json({ error: 'Заказ уже на этом столе' });
  }

  // Проверяем что новый стол существует и принадлежит тенанту
  const table = await get('SELECT t.*, h.id as hall_id FROM tables t JOIN halls h ON t.hall_id = h.id WHERE t.id = $1 AND t.tenant_id = $2', [table_id, req.tenantId]);
  if (!table) return res.status(404).json({ error: 'Стол не найден' });

  // Проверяем лимит по залам
  const maxHalls = req.plan?.max_halls;
  if (maxHalls && table.hall_id) {
    const hallIds = await all(
      'SELECT id FROM halls WHERE active = true AND tenant_id = $1 ORDER BY id',
      [req.tenantId]
    );
    const allowedIds = hallIds.slice(0, maxHalls).map((h) => h.id);
    if (!allowedIds.includes(table.hall_id)) {
      return res.status(403).json({ error: 'Зал заблокирован по лимиту тарифа. Обновите план.' });
    }
  }

  // Проверяем что на новом столе нет открытого заказа
  const existing = await get(
    "SELECT id FROM orders WHERE table_id = $1 AND status = 'open' AND tenant_id = $2",
    [table_id, req.tenantId]
  );
  if (existing) {
    return res.status(400).json({ error: 'На этом столике уже есть открытый заказ' });
  }

  await run('UPDATE orders SET table_id = $1 WHERE id = $2', [table_id, order.id]);

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
  await loadItemModifiers(updated.items);

  emitEvent(req, 'order:updated', updated);
  res.json(updated);
});

/**
 * Изменить способ оплаты у закрытого заказа.
 * Пересчитывает итоги кассового дня (total_cash / total_card).
 */
router.patch('/:id/payment-method', async (req, res) => {
  const { payment_method, paid_cash, paid_card } = req.body;
  if (!payment_method || !['cash', 'card', 'mixed', 'delivery'].includes(payment_method)) {
    return res.status(400).json({ error: 'Укажите способ оплаты: cash, card, mixed или delivery' });
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

/**
 * Запустить таймер на заказе (ручной режим).
 */
router.post('/:id/start-timer', async (req, res) => {
  const order = await get(
    "SELECT * FROM orders WHERE id = $1 AND status = 'open' AND tenant_id = $2",
    [req.params.id, req.tenantId]
  );
  if (!order) return res.status(404).json({ error: 'Заказ не найден или уже закрыт' });

  if (order.timer_started_at) {
    return res.status(400).json({ error: 'Таймер уже запущен' });
  }

  await run('UPDATE orders SET timer_started_at = NOW() WHERE id = $1', [order.id]);

  const updated = await get('SELECT * FROM orders WHERE id = $1', [order.id]);
  updated.items = await all('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  await loadItemModifiers(updated.items);
  emitEvent(req, 'order:updated', updated);
  res.json(updated);
});

module.exports = router;
