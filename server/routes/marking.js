const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { loadIntegrations } = require('../middleware/integration');

const router = express.Router();
router.use(authMiddleware, checkSubscription, loadIntegrations);

// Список маркированных единиц с фильтрами
router.get('/', async (req, res) => {
  const { marking_type, status, product_id, limit = 100, offset = 0 } = req.query;

  let sql = `
    SELECT mi.*, p.name as product_name
    FROM marked_items mi
    LEFT JOIN products p ON mi.product_id = p.id
    WHERE mi.tenant_id = $1
  `;
  const params = [req.tenantId];
  let idx = 2;

  if (marking_type) {
    sql += ` AND mi.marking_type = $${idx++}`;
    params.push(marking_type);
  }
  if (status) {
    sql += ` AND mi.status = $${idx++}`;
    params.push(status);
  }
  if (product_id) {
    sql += ` AND mi.product_id = $${idx++}`;
    params.push(product_id);
  }

  sql += ` ORDER BY mi.id DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(parseInt(limit), parseInt(offset));

  const items = await all(sql, params);

  const countRow = await get(
    'SELECT COUNT(*)::int as total FROM marked_items WHERE tenant_id = $1',
    [req.tenantId]
  );

  res.json({ items, total: countRow.total });
});

// Универсальный скан маркировочного кода
router.post('/scan', async (req, res) => {
  const { code, context, context_id, product_id } = req.body;
  if (!code) return res.status(400).json({ error: 'Код маркировки не указан' });

  // Определяем тип маркировки по формату кода
  let markingType = 'tobacco';
  let parsedData = {};

  // DataMatrix для табака: начинается с 01 + GTIN(14) + 21 + serial
  if (code.startsWith('01') && code.length >= 31) {
    markingType = 'tobacco';
    parsedData = {
      tobacco_gtin: code.substring(2, 16),
      tobacco_serial: code.substring(18, 25),
      tobacco_cis: code,
    };
    // Попытка извлечь MRP (после 8005)
    const mrpIdx = code.indexOf('8005');
    if (mrpIdx !== -1) {
      const mrpStr = code.substring(mrpIdx + 4, mrpIdx + 10);
      parsedData.tobacco_mrp = parseInt(mrpStr) / 100;
    }
  } else if (code.length >= 68 || code.startsWith('22')) {
    // Алкогольная ФСМ / ЕГАИС код — обычно длиннее
    markingType = 'egais';
    parsedData = { egais_fsm: code };
  }

  // Проверяем, не отсканирован ли уже
  const existing = await get(
    'SELECT id, status FROM marked_items WHERE marking_code = $1 AND tenant_id = $2',
    [code, req.tenantId]
  );

  if (existing) {
    return res.status(400).json({
      error: 'Код уже зарегистрирован',
      item: existing,
    });
  }

  // Пробуем определить товар по GTIN/алкокоду
  let resolvedProductId = product_id;
  if (!resolvedProductId && parsedData.tobacco_gtin) {
    const product = await get(
      'SELECT id FROM products WHERE tobacco_gtin = $1 AND tenant_id = $2 AND active = true',
      [parsedData.tobacco_gtin, req.tenantId]
    );
    if (product) resolvedProductId = product.id;
  }

  // Определяем статус в зависимости от контекста
  let status = 'received';
  if (context === 'supply') status = 'received';
  else if (context === 'order') status = 'sold';

  // Создаём запись
  const result = await run(
    `INSERT INTO marked_items (tenant_id, product_id, marking_code, marking_type, status,
      egais_fsm, tobacco_cis, tobacco_gtin, tobacco_serial, tobacco_mrp,
      supply_id, order_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [
      req.tenantId, resolvedProductId || null, code, markingType, status,
      parsedData.egais_fsm || null,
      parsedData.tobacco_cis || null, parsedData.tobacco_gtin || null,
      parsedData.tobacco_serial || null, parsedData.tobacco_mrp || null,
      context === 'supply' ? context_id : null,
      context === 'order' ? context_id : null,
    ]
  );

  // Обновляем счётчик в supply_items или order_items
  if (context === 'supply' && context_id && resolvedProductId) {
    await run(
      `UPDATE supply_items SET marked_count = marked_count + 1
       WHERE supply_id = $1 AND product_id = $2`,
      [context_id, resolvedProductId]
    );
  } else if (context === 'order' && context_id && resolvedProductId) {
    await run(
      `UPDATE order_items SET marked_codes_scanned = marked_codes_scanned + 1
       WHERE order_id = $1 AND product_id = $2`,
      [context_id, resolvedProductId]
    );
  }

  res.json({
    id: result.id,
    marking_type: markingType,
    product_id: resolvedProductId,
    ...parsedData,
  });
});

// Получить маркированные коды по поставке
router.get('/supply/:supplyId', async (req, res) => {
  const items = await all(
    `SELECT mi.*, p.name as product_name FROM marked_items mi
     LEFT JOIN products p ON mi.product_id = p.id
     WHERE mi.supply_id = $1 AND mi.tenant_id = $2 ORDER BY mi.id`,
    [req.params.supplyId, req.tenantId]
  );
  res.json(items);
});

// Получить маркированные коды по заказу
router.get('/order/:orderId', async (req, res) => {
  const items = await all(
    `SELECT mi.*, p.name as product_name FROM marked_items mi
     LEFT JOIN products p ON mi.product_id = p.id
     WHERE mi.order_id = $1 AND mi.tenant_id = $2 ORDER BY mi.id`,
    [req.params.orderId, req.tenantId]
  );
  res.json(items);
});

// Списать маркированную единицу
router.post('/:id/write-off', adminOnly, async (req, res) => {
  const item = await get(
    'SELECT * FROM marked_items WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!item) return res.status(404).json({ error: 'Маркированная единица не найдена' });

  await run(
    "UPDATE marked_items SET status = 'written_off', updated_at = NOW() WHERE id = $1",
    [req.params.id]
  );

  res.json({ success: true });
});

module.exports = router;
