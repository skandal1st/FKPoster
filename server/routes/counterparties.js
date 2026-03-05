const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { loadIntegrations } = require('../middleware/integration');
const EdoService = require('../services/edo');

const router = express.Router();
router.use(authMiddleware, adminOnly, checkSubscription);

// Список контрагентов
router.get('/', async (req, res) => {
  const { active } = req.query;
  let sql = 'SELECT * FROM counterparties WHERE tenant_id = $1';
  const params = [req.tenantId];

  if (active === 'true') {
    sql += ' AND is_active = true';
  }

  sql += ' ORDER BY name';
  const counterparties = await all(sql, params);
  res.json(counterparties);
});

// Создать контрагента
router.post('/', async (req, res) => {
  const { name, inn, kpp, legal_address, edo_id, egais_fsrar_id, phone, email, note } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Укажите наименование контрагента' });
  }

  const result = await run(
    `INSERT INTO counterparties (tenant_id, name, inn, kpp, legal_address, edo_id, egais_fsrar_id, phone, email, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [req.tenantId, name, inn || null, kpp || null, legal_address || null,
     edo_id || null, egais_fsrar_id || null, phone || null, email || null, note || null]
  );

  const cp = await get('SELECT * FROM counterparties WHERE id = $1', [result.id]);
  res.json(cp);
});

// Обновить контрагента
router.put('/:id', async (req, res) => {
  const { name, inn, kpp, legal_address, edo_id, egais_fsrar_id, phone, email, note } = req.body;

  const existing = await get(
    'SELECT id FROM counterparties WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!existing) return res.status(404).json({ error: 'Контрагент не найден' });

  await run(
    `UPDATE counterparties SET name = $1, inn = $2, kpp = $3, legal_address = $4,
     edo_id = $5, egais_fsrar_id = $6, phone = $7, email = $8, note = $9
     WHERE id = $10 AND tenant_id = $11`,
    [name, inn || null, kpp || null, legal_address || null,
     edo_id || null, egais_fsrar_id || null, phone || null, email || null, note || null,
     req.params.id, req.tenantId]
  );

  const cp = await get('SELECT * FROM counterparties WHERE id = $1', [req.params.id]);
  res.json(cp);
});

// Деактивировать контрагента
router.delete('/:id', async (req, res) => {
  const existing = await get(
    'SELECT id FROM counterparties WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!existing) return res.status(404).json({ error: 'Контрагент не найден' });

  await run(
    'UPDATE counterparties SET is_active = false WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  res.json({ success: true });
});

// Поиск контрагента в ЭДО по ИНН
router.get('/search-edo', loadIntegrations, async (req, res) => {
  const { inn } = req.query;
  if (!inn) return res.status(400).json({ error: 'Укажите ИНН' });

  if (!req.integrations?.edo_enabled) {
    return res.status(400).json({ error: 'ЭДО не включено' });
  }

  try {
    const edo = new EdoService(req.tenantId, req.integrations);
    const results = await edo.searchCounterparty(inn);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
