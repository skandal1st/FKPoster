const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription, checkFeature } = require('../middleware/subscription');
const { loadIntegrations, requireEdo } = require('../middleware/integration');
const EdoService = require('../services/edo');
const { buildUPD, buildWriteOffAct } = require('../services/edo/documentBuilder');

const router = express.Router();
router.use(authMiddleware, adminOnly, checkSubscription, checkFeature('edo'), loadIntegrations);

// Список ЭДО-документов
router.get('/documents', async (req, res) => {
  const { doc_type, status, direction, limit = 50, offset = 0 } = req.query;

  let sql = 'SELECT ed.*, c.name as counterparty_name FROM edo_documents ed LEFT JOIN counterparties c ON c.id = ed.counterparty_id WHERE ed.tenant_id = $1';
  const params = [req.tenantId];
  let idx = 2;

  if (doc_type) {
    sql += ` AND ed.doc_type = $${idx++}`;
    params.push(doc_type);
  }
  if (status) {
    sql += ` AND ed.status = $${idx++}`;
    params.push(status);
  }
  if (direction) {
    sql += ` AND ed.direction = $${idx++}`;
    params.push(direction);
  }

  sql += ` ORDER BY ed.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(Number(limit), Number(offset));

  const docs = await all(sql, params);
  res.json(docs);
});

// Детали документа
router.get('/documents/:id', async (req, res) => {
  const doc = await get(
    `SELECT ed.*, c.name as counterparty_name
     FROM edo_documents ed LEFT JOIN counterparties c ON c.id = ed.counterparty_id
     WHERE ed.id = $1 AND ed.tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });
  res.json(doc);
});

// Загрузить входящие из ЭДО-провайдера
router.post('/documents/fetch', requireEdo, async (req, res) => {
  try {
    const edo = new EdoService(req.tenantId, req.integrations);
    const result = await edo.fetchIncoming(req.body);
    // Попробуем авто-сопоставить с ЕГАИС
    const matched = await edo.autoMatchEgais();
    res.json({ fetched: result.length, documents: result, matched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Подписать/принять входящий документ
router.post('/documents/:id/accept', requireEdo, async (req, res) => {
  try {
    const edo = new EdoService(req.tenantId, req.integrations);
    const result = await edo.acceptDocument(Number(req.params.id));
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Отклонить входящий документ
router.post('/documents/:id/reject', requireEdo, async (req, res) => {
  try {
    const edo = new EdoService(req.tenantId, req.integrations);
    const result = await edo.rejectDocument(Number(req.params.id), req.body.reason || '');
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Связать с ЕГАИС-документом вручную
router.post('/documents/:id/link-egais', async (req, res) => {
  const { egais_document_id } = req.body;
  if (!egais_document_id) {
    return res.status(400).json({ error: 'Укажите egais_document_id' });
  }

  const doc = await get('SELECT id FROM edo_documents WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!doc) return res.status(404).json({ error: 'ЭДО-документ не найден' });

  const egaisDoc = await get('SELECT id FROM egais_documents WHERE id = $1 AND tenant_id = $2', [egais_document_id, req.tenantId]);
  if (!egaisDoc) return res.status(404).json({ error: 'ЕГАИС-документ не найден' });

  await run(
    'UPDATE edo_documents SET egais_document_id = $1, updated_at = NOW() WHERE id = $2',
    [egais_document_id, req.params.id]
  );

  res.json({ success: true });
});

// Сформировать и отправить исходящий УПД
router.post('/send-upd', requireEdo, async (req, res) => {
  const { counterparty_id, items, doc_number, doc_date } = req.body;

  if (!counterparty_id || !items || items.length === 0) {
    return res.status(400).json({ error: 'Укажите контрагента и позиции' });
  }

  const tenant = await get(
    'SELECT legal_name, inn, kpp, legal_address FROM tenants WHERE id = $1',
    [req.tenantId]
  );
  if (!tenant?.inn) {
    return res.status(400).json({ error: 'Заполните реквизиты юрлица в настройках (ИНН обязателен)' });
  }

  const counterparty = await get(
    'SELECT * FROM counterparties WHERE id = $1 AND tenant_id = $2 AND is_active = true',
    [counterparty_id, req.tenantId]
  );
  if (!counterparty) {
    return res.status(404).json({ error: 'Контрагент не найден' });
  }

  const docDate = doc_date || new Date().toISOString().split('T')[0];
  const docNumber = doc_number || `UPD-${Date.now()}`;

  const updDocument = buildUPD({
    seller: tenant,
    buyer: counterparty,
    doc_number: docNumber,
    doc_date: docDate,
    items,
  });

  try {
    const edo = new EdoService(req.tenantId, req.integrations);
    const result = await edo.sendDocument(updDocument, {
      counterpartyId: counterparty_id,
      createdBy: req.user.id,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Сформировать и отправить акт списания
router.post('/send-writeoff-act', requireEdo, async (req, res) => {
  const { items, doc_number, doc_date, reason, egais_document_id } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Укажите позиции для списания' });
  }

  const tenant = await get(
    'SELECT legal_name, inn, kpp FROM tenants WHERE id = $1',
    [req.tenantId]
  );
  if (!tenant?.inn) {
    return res.status(400).json({ error: 'Заполните реквизиты юрлица в настройках (ИНН обязателен)' });
  }

  const docDate = doc_date || new Date().toISOString().split('T')[0];
  const docNumber = doc_number || `WO-${Date.now()}`;

  const actDocument = buildWriteOffAct({
    organization: tenant,
    doc_number: docNumber,
    doc_date: docDate,
    reason: reason || 'Списание',
    items,
  });

  try {
    const edo = new EdoService(req.tenantId, req.integrations);
    const result = await edo.sendDocument(actDocument, {
      egaisDocumentId: egais_document_id || null,
      createdBy: req.user.id,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Тест подключения к ЭДО
router.post('/test-connection', requireEdo, async (req, res) => {
  try {
    const edo = new EdoService(req.tenantId, req.integrations);
    const result = await edo.testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
