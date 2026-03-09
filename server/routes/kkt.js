const express = require('express');
const { get } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription, checkFeature } = require('../middleware/subscription');
const { loadIntegrations, requireKkt } = require('../middleware/integration');
const KktService = require('../services/kkt');

const router = express.Router();
router.use(authMiddleware, adminOnly, checkSubscription, checkFeature('kkt'), loadIntegrations);

// Список чеков
router.get('/receipts', async (req, res) => {
  try {
    if (!req.integrations?.kkt_enabled) {
      return res.json([]);
    }
    const kkt = new KktService(req.tenantId, req.integrations);
    const receipts = await kkt.getReceipts(req.query);
    res.json(receipts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Детали чека
router.get('/receipts/:id', async (req, res) => {
  try {
    const receipt = await get(
      'SELECT * FROM kkt_receipts WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!receipt) return res.status(404).json({ error: 'Чек не найден' });
    res.json(receipt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Повторная отправка ошибочного чека
router.post('/receipts/:id/retry', requireKkt, async (req, res) => {
  try {
    const kkt = new KktService(req.tenantId, req.integrations);
    const result = await kkt.retryReceipt(Number(req.params.id));
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Проверить статус sent-чека
router.post('/receipts/:id/check-status', requireKkt, async (req, res) => {
  try {
    const kkt = new KktService(req.tenantId, req.integrations);
    const result = await kkt.checkReceiptStatus(Number(req.params.id));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Массовая проверка sent-чеков
router.post('/poll-pending', requireKkt, async (req, res) => {
  try {
    const kkt = new KktService(req.tenantId, req.integrations);
    const results = await kkt.pollPendingReceipts();
    res.json({ results, count: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Статистика по статусам (для бейджа)
router.get('/stats', async (req, res) => {
  try {
    if (!req.integrations?.kkt_enabled) {
      return res.json({ pending: 0, error: 0, sent: 0, done: 0 });
    }
    const kkt = new KktService(req.tenantId, req.integrations);
    const pendingCount = await kkt.getPendingCount();
    res.json({ pending_and_error: pendingCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
