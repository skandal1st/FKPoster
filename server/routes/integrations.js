const express = require('express');
const { get, run } = require('../db');
const { authMiddleware, ownerOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

// Получить настройки интеграций
router.get('/', async (req, res) => {
  let integrations = await get(
    'SELECT * FROM tenant_integrations WHERE tenant_id = $1',
    [req.tenantId]
  );

  if (!integrations) {
    integrations = {
      egais_enabled: false,
      egais_utm_host: 'localhost',
      egais_utm_port: 8080,
      egais_fsrar_id: null,
      chestniy_znak_enabled: false,
      chestniy_znak_token: null,
      chestniy_znak_omsid: null,
      chestniy_znak_environment: 'sandbox',
    };
  }

  // Не отправляем токен ЧЗ в открытом виде
  if (integrations.chestniy_znak_token) {
    integrations.chestniy_znak_token_set = true;
    integrations.chestniy_znak_token = '••••••••';
  }

  res.json(integrations);
});

// Сохранить настройки интеграций (только owner)
router.put('/', ownerOnly, async (req, res) => {
  const {
    egais_enabled, egais_utm_host, egais_utm_port, egais_fsrar_id,
    chestniy_znak_enabled, chestniy_znak_token, chestniy_znak_omsid, chestniy_znak_environment,
  } = req.body;

  const existing = await get(
    'SELECT id FROM tenant_integrations WHERE tenant_id = $1',
    [req.tenantId]
  );

  if (existing) {
    // Если токен = маска, не обновляем его
    const tokenUpdate = chestniy_znak_token && !chestniy_znak_token.includes('••••')
      ? chestniy_znak_token
      : undefined;

    let sql = `UPDATE tenant_integrations SET
      egais_enabled = $1, egais_utm_host = $2, egais_utm_port = $3, egais_fsrar_id = $4,
      chestniy_znak_enabled = $5, chestniy_znak_omsid = $6, chestniy_znak_environment = $7,
      updated_at = NOW()`;
    const params = [
      egais_enabled ?? false, egais_utm_host || 'localhost', egais_utm_port || 8080,
      egais_fsrar_id || null,
      chestniy_znak_enabled ?? false, chestniy_znak_omsid || null,
      chestniy_znak_environment || 'sandbox',
    ];

    if (tokenUpdate !== undefined) {
      sql += `, chestniy_znak_token = $${params.length + 1}`;
      params.push(tokenUpdate);
    }

    sql += ` WHERE tenant_id = $${params.length + 1}`;
    params.push(req.tenantId);

    await run(sql, params);
  } else {
    await run(
      `INSERT INTO tenant_integrations (tenant_id, egais_enabled, egais_utm_host, egais_utm_port, egais_fsrar_id,
        chestniy_znak_enabled, chestniy_znak_token, chestniy_znak_omsid, chestniy_znak_environment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        req.tenantId,
        egais_enabled ?? false, egais_utm_host || 'localhost', egais_utm_port || 8080,
        egais_fsrar_id || null,
        chestniy_znak_enabled ?? false, chestniy_znak_token || null,
        chestniy_znak_omsid || null, chestniy_znak_environment || 'sandbox',
      ]
    );
  }

  res.json({ success: true });
});

// Тест подключения ЕГАИС (проверка доступности УТМ)
router.post('/test-egais', ownerOnly, async (req, res) => {
  const { egais_utm_host, egais_utm_port } = req.body;
  const host = egais_utm_host || 'localhost';
  const port = egais_utm_port || 8080;

  // В реальности тут будет запрос к УТМ, пока заглушка
  res.json({
    success: false,
    message: `Подключение к УТМ ${host}:${port} — функция будет доступна после настройки локального агента`,
  });
});

// Тест подключения Честный знак
router.post('/test-chestniy-znak', ownerOnly, async (req, res) => {
  // В реальности тут будет запрос к API CRPT
  res.json({
    success: false,
    message: 'Подключение к API Честный знак — функция будет доступна после получения доступа к API',
  });
});

module.exports = router;
