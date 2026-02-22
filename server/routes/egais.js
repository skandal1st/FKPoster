const express = require('express');
const { all, get } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { loadIntegrations, requireEgais } = require('../middleware/integration');
const EgaisService = require('../services/egais');

const router = express.Router();
router.use(authMiddleware, checkSubscription, loadIntegrations, requireEgais);

function createService(req) {
  return new EgaisService(req.tenantId, req.integrations);
}

// Получить входящие документы из УТМ
router.get('/incoming', adminOnly, async (req, res) => {
  try {
    const service = createService(req);
    const docs = await service.fetchIncoming();
    res.json(docs);
  } catch (err) {
    res.status(502).json({ error: `Ошибка связи с УТМ: ${err.message}` });
  }
});

// Получить конкретный входящий документ
router.get('/incoming/:docId', adminOnly, async (req, res) => {
  try {
    const service = createService(req);
    const doc = await service.fetchIncomingDoc(req.params.docId);
    res.json(doc);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Подтвердить ТТН
router.post('/ttn/:wayBillId/accept', adminOnly, async (req, res) => {
  try {
    const service = createService(req);
    const result = await service.acceptTTN(req.params.wayBillId, req.body.note || '');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Отклонить ТТН
router.post('/ttn/:wayBillId/reject', adminOnly, async (req, res) => {
  try {
    const service = createService(req);
    const result = await service.rejectTTN(req.params.wayBillId, req.body.note || '');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Переместить на Регистр 2
router.post('/transfer-to-shop', adminOnly, async (req, res) => {
  const { items } = req.body;
  if (!items || !items.length) {
    return res.status(400).json({ error: 'Укажите позиции для перемещения' });
  }

  try {
    const service = createService(req);
    const result = await service.transferToShop(items);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Списание
router.post('/write-off', adminOnly, async (req, res) => {
  const { items, note } = req.body;
  if (!items || !items.length) {
    return res.status(400).json({ error: 'Укажите позиции для списания' });
  }

  try {
    const service = createService(req);
    const result = await service.writeOff(items, note || '');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Запросить остатки
router.post('/query-stock', adminOnly, async (req, res) => {
  const { register_type = 'reg2' } = req.body;

  try {
    const service = createService(req);
    const result = await service.queryRegisters(register_type);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить кеш остатков
router.get('/stock/:registerType', async (req, res) => {
  const registerType = req.params.registerType;
  if (!['reg1', 'reg2'].includes(registerType)) {
    return res.status(400).json({ error: 'Неверный тип регистра' });
  }

  const service = createService(req);
  const stock = await service.getStock(registerType);
  res.json(stock);
});

// Журнал документов ЕГАИС
router.get('/documents', async (req, res) => {
  const { doc_type, direction, status, limit = 50, offset = 0 } = req.query;

  let sql = 'SELECT * FROM egais_documents WHERE tenant_id = $1';
  const params = [req.tenantId];
  let idx = 2;

  if (doc_type) {
    sql += ` AND doc_type = $${idx++}`;
    params.push(doc_type);
  }
  if (direction) {
    sql += ` AND direction = $${idx++}`;
    params.push(direction);
  }
  if (status) {
    sql += ` AND status = $${idx++}`;
    params.push(status);
  }

  sql += ` ORDER BY id DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(parseInt(limit), parseInt(offset));

  const docs = await all(sql, params);
  res.json(docs);
});

// Получить конкретный документ из журнала
router.get('/documents/:id', async (req, res) => {
  const doc = await get(
    'SELECT * FROM egais_documents WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });
  res.json(doc);
});

module.exports = router;
