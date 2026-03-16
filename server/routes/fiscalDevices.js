const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { get, all, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const config = require('../config');

const router = express.Router();

// ─── Middleware для обычных веб-запросов (из админки) ─────────────────────────
const adminAuth = [authMiddleware, adminOnly, checkSubscription];

// ─── Rate limiting для публичного эндпоинта /pair ──────────────────────────────
const pairLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // Максимум 10 попыток привязки с одного IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `pair:${req.headers['x-real-ip'] || req.ip}`;
  },
  message: { error: 'Слишком много попыток привязки. Попробуйте позже.' }
});

// ─── Middleware для bridge-устройств (по device JWT) ──────────────────────────
async function deviceAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация устройства' });
  }
  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, config.JWT_SECRET);
    if (!payload.device_id || !payload.tenant_id) {
      return res.status(401).json({ error: 'Неверный токен устройства' });
    }
    const device = await get(
      'SELECT * FROM kkt_physical_devices WHERE device_id = $1 AND tenant_id = $2',
      [payload.device_id, payload.tenant_id]
    );
    if (!device) {
      return res.status(401).json({ error: 'Устройство не найдено' });
    }
    req.device = device;
    req.tenantId = payload.tenant_id;
    next();
  } catch {
    return res.status(401).json({ error: 'Неверный токен устройства' });
  }
}

// =============================================================================
// ADMIN ROUTES (из веб-панели)
// =============================================================================

// GET /api/fiscal-devices — список устройств тенанта
router.get('/', ...adminAuth, async (req, res) => {
  try {
    const devices = await all(
      `SELECT id, device_id, name, platform, status, atol_model, last_seen_at, created_at
       FROM kkt_physical_devices
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [req.tenantId]
    );
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/fiscal-devices/:id — удалить устройство
router.delete('/:id', ...adminAuth, async (req, res) => {
  try {
    const device = await get(
      'SELECT id FROM kkt_physical_devices WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!device) return res.status(404).json({ error: 'Устройство не найдено' });

    await run('DELETE FROM kkt_physical_devices WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fiscal-devices/pairing-token — создать токен для привязки устройства
// Возвращает одноразовую ссылку, которую пользователь вставляет в bridge-клиент
router.post('/pairing-token', ...adminAuth, async (req, res) => {
  try {
    const { device_name } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 часа

    await run(
      `INSERT INTO kkt_pairing_tokens (tenant_id, token, device_name, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [req.tenantId, token, device_name || 'Новое устройство', expiresAt]
    );

    // Формируем pairing URL с учётом окружения
    let baseUrl = config.BASE_URL;
    if (!baseUrl) {
      // В dev режиме используем http://BASE_DOMAIN:PORT
      if (config.NODE_ENV === 'development') {
        baseUrl = `http://${config.BASE_DOMAIN}:${config.PORT}`;
      } else {
        // В production используем https://BASE_DOMAIN
        baseUrl = `https://${config.BASE_DOMAIN}`;
      }
    }
    const pairingUrl = `${baseUrl}/api/fiscal-devices/pair?token=${token}`;
    res.json({ token, pairing_url: pairingUrl, expires_at: expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiscal-devices/queue — история очереди чеков (для админки)
router.get('/queue', ...adminAuth, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const conditions = ['q.tenant_id = $1'];
    const params = [req.tenantId];

    if (status) {
      conditions.push(`q.status = $${params.length + 1}`);
      params.push(status);
    }

    const items = await all(
      `SELECT q.*, d.name as device_name, d.platform,
              o.number as order_number
       FROM kkt_physical_queue q
       LEFT JOIN kkt_physical_devices d ON d.device_id = q.device_id
       LEFT JOIN orders o ON o.id = q.order_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY q.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// PAIRING ENDPOINT (публичный, вызывается bridge-клиентом при первом запуске)
// =============================================================================

// POST /api/fiscal-devices/pair — bridge передаёт токен + device_id, получает JWT
router.post('/pair', pairLimiter, async (req, res) => {
  try {
    const { token, device_id, platform, atol_model, name } = req.body;
    if (!token || !device_id || !platform) {
      return res.status(400).json({ error: 'Требуются поля: token, device_id, platform' });
    }

    const pairingToken = await get(
      `SELECT * FROM kkt_pairing_tokens
       WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
      [token]
    );
    if (!pairingToken) {
      return res.status(400).json({ error: 'Токен недействителен или истёк' });
    }

    // Пометить токен как использованный
    await run('UPDATE kkt_pairing_tokens SET used = TRUE WHERE id = $1', [pairingToken.id]);

    // Зарегистрировать устройство (или обновить если уже было)
    await run(
      `INSERT INTO kkt_physical_devices (tenant_id, device_id, name, platform, atol_model, status, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, 'online', NOW())
       ON CONFLICT (device_id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         name = COALESCE(EXCLUDED.name, kkt_physical_devices.name),
         platform = EXCLUDED.platform,
         atol_model = COALESCE(EXCLUDED.atol_model, kkt_physical_devices.atol_model),
         status = 'online',
         last_seen_at = NOW()`,
      [
        pairingToken.tenant_id,
        device_id,
        name || pairingToken.device_name,
        platform,
        atol_model || null,
      ]
    );

    // Выдать device JWT (без срока — отзывается через удаление устройства)
    const deviceToken = jwt.sign(
      { device_id, tenant_id: pairingToken.tenant_id },
      config.JWT_SECRET
    );

    res.json({ device_token: deviceToken, tenant_id: pairingToken.tenant_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// DEVICE ROUTES (вызываются bridge-клиентом с device JWT)
// =============================================================================

// POST /api/fiscal-devices/heartbeat — устройство сообщает что живо
router.post('/heartbeat', deviceAuth, async (req, res) => {
  try {
    await run(
      `UPDATE kkt_physical_devices SET status = 'online', last_seen_at = NOW()
       WHERE device_id = $1`,
      [req.device.device_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiscal-devices/pending — bridge забирает непечатанные чеки из очереди
router.get('/pending', deviceAuth, async (req, res) => {
  try {
    const items = await all(
      `SELECT id, order_id, receipt_type, receipt_data
       FROM kkt_physical_queue
       WHERE device_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 10`,
      [req.device.device_id]
    );

    if (items.length > 0) {
      const ids = items.map((i) => i.id);
      await run(
        `UPDATE kkt_physical_queue SET status = 'sent', updated_at = NOW()
         WHERE id = ANY($1::int[])`,
        [ids]
      );
    }

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/fiscal-devices/queue/:id/confirm — bridge подтверждает успешную печать
router.patch('/queue/:id/confirm', deviceAuth, async (req, res) => {
  try {
    const { fiscal_number, fiscal_document_number, fiscal_sign, fiscal_datetime } = req.body;
    const item = await get(
      'SELECT * FROM kkt_physical_queue WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Запись не найдена' });

    await run(
      `UPDATE kkt_physical_queue SET
         status = 'done',
         fiscal_number = $1,
         fiscal_document_number = $2,
         fiscal_sign = $3,
         fiscal_datetime = $4,
         updated_at = NOW()
       WHERE id = $5`,
      [fiscal_number, fiscal_document_number, fiscal_sign, fiscal_datetime || new Date(), item.id]
    );

    // Если это чек продажи — сохранить фискальные данные в заказ
    if (item.order_id && item.receipt_type === 'sell') {
      await run(
        `UPDATE orders SET
           fiscal_number = $1,
           fiscal_document_number = $2,
           fiscal_sign = $3
         WHERE id = $4`,
        [fiscal_number, fiscal_document_number, fiscal_sign, item.order_id]
      );
    }

    // Уведомить веб-клиент тенанта через socket
    const io = req.app.get('io');
    if (io) {
      io.to(`tenant:${req.tenantId}`).emit('fiscal:confirmed', {
        queue_id: item.id,
        order_id: item.order_id,
        fiscal_number,
        fiscal_sign,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/fiscal-devices/queue/:id/error — bridge сообщает об ошибке печати
router.patch('/queue/:id/error', deviceAuth, async (req, res) => {
  try {
    const { error_message } = req.body;
    const item = await get(
      'SELECT * FROM kkt_physical_queue WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Запись не найдена' });

    await run(
      `UPDATE kkt_physical_queue SET
         status = 'error',
         error_message = $1,
         retry_count = retry_count + 1,
         updated_at = NOW()
       WHERE id = $2`,
      [error_message || 'Неизвестная ошибка', item.id]
    );

    // Уведомить веб-клиент тенанта
    const io = req.app.get('io');
    if (io) {
      io.to(`tenant:${req.tenantId}`).emit('fiscal:error', {
        queue_id: item.id,
        order_id: item.order_id,
        error: error_message,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fiscal-devices/queue — постановка чека в очередь (из orders/kkt при закрытии заказа)
// Может вызываться и из веб-клиента с adminAuth
router.post('/queue', ...adminAuth, async (req, res) => {
  try {
    const { order_id, device_id, receipt_type = 'sell', receipt_data } = req.body;
    if (!device_id || !receipt_data) {
      return res.status(400).json({ error: 'Требуются поля: device_id, receipt_data' });
    }

    const device = await get(
      'SELECT * FROM kkt_physical_devices WHERE device_id = $1 AND tenant_id = $2',
      [device_id, req.tenantId]
    );
    if (!device) return res.status(404).json({ error: 'Устройство не найдено' });

    const result = await get(
      `INSERT INTO kkt_physical_queue (tenant_id, order_id, device_id, receipt_type, receipt_data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [req.tenantId, order_id || null, device_id, receipt_type, JSON.stringify(receipt_data)]
    );

    // Уведомить bridge по socket (если онлайн)
    const io = req.app.get('io');
    if (io) {
      io.to(`device:${device_id}`).emit('fiscal:print', {
        queue_id: result.id,
        receipt_type,
        receipt_data,
      });
    }

    res.json({ ok: true, queue_id: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
