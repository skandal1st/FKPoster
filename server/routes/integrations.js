const express = require('express');
const { get, run } = require('../db');
const { authMiddleware, ownerOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { invalidateIntegration } = require('../cache');

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
      edo_enabled: false,
      edo_provider: null,
      edo_sbis_login: null,
      edo_sbis_password: null,
      edo_sbis_app_client_id: null,
      edo_sbis_app_secret: null,
      edo_diadoc_api_key: null,
      edo_diadoc_login: null,
      edo_diadoc_password: null,
      edo_diadoc_box_id: null,
      kkt_enabled: false,
      kkt_provider: null,
      kkt_strict_mode: false,
      kkt_default_vat: 'none',
      kkt_group_code: null,
      kkt_login: null,
      kkt_password: null,
      kkt_inn: null,
      kkt_payment_address: null,
      kkt_sno: null,
    };
  }

  // Не отправляем токены/пароли в открытом виде
  if (integrations.chestniy_znak_token) {
    integrations.chestniy_znak_token_set = true;
    integrations.chestniy_znak_token = '••••••••';
  }
  if (integrations.edo_sbis_password) {
    integrations.edo_sbis_password_set = true;
    integrations.edo_sbis_password = '••••••••';
  }
  if (integrations.edo_sbis_app_secret) {
    integrations.edo_sbis_app_secret_set = true;
    integrations.edo_sbis_app_secret = '••••••••';
  }
  if (integrations.edo_diadoc_api_key) {
    integrations.edo_diadoc_api_key_set = true;
    integrations.edo_diadoc_api_key = '••••••••';
  }
  if (integrations.edo_diadoc_password) {
    integrations.edo_diadoc_password_set = true;
    integrations.edo_diadoc_password = '••••••••';
  }
  if (integrations.kkt_password) {
    integrations.kkt_password_set = true;
    integrations.kkt_password = '••••••••';
  }
  // Не отправляем кешированный токен АТОЛ на клиент
  delete integrations.kkt_token;
  delete integrations.kkt_token_expires_at;

  res.json(integrations);
});

// Сохранить настройки интеграций (только owner)
router.put('/', ownerOnly, async (req, res) => {
  const {
    egais_enabled, egais_utm_host, egais_utm_port, egais_fsrar_id,
    chestniy_znak_enabled, chestniy_znak_token, chestniy_znak_omsid, chestniy_znak_environment,
    edo_enabled, edo_provider,
    edo_sbis_login, edo_sbis_password, edo_sbis_app_client_id, edo_sbis_app_secret,
    edo_diadoc_api_key, edo_diadoc_login, edo_diadoc_password, edo_diadoc_box_id,
    kkt_enabled, kkt_provider, kkt_strict_mode, kkt_default_vat,
    kkt_group_code, kkt_login, kkt_password, kkt_inn, kkt_payment_address, kkt_sno,
  } = req.body;

  const existing = await get(
    'SELECT id FROM tenant_integrations WHERE tenant_id = $1',
    [req.tenantId]
  );

  // Фильтр: если значение = маска, не обновляем
  const notMask = (v) => v && !String(v).includes('••••') ? v : undefined;

  if (existing) {
    let sql = `UPDATE tenant_integrations SET
      egais_enabled = $1, egais_utm_host = $2, egais_utm_port = $3, egais_fsrar_id = $4,
      chestniy_znak_enabled = $5, chestniy_znak_omsid = $6, chestniy_znak_environment = $7,
      edo_enabled = $8, edo_provider = $9, edo_sbis_login = $10,
      edo_sbis_app_client_id = $11, edo_diadoc_login = $12, edo_diadoc_box_id = $13,
      kkt_enabled = $14, kkt_provider = $15, kkt_strict_mode = $16, kkt_default_vat = $17,
      kkt_group_code = $18, kkt_login = $19, kkt_inn = $20, kkt_payment_address = $21, kkt_sno = $22,
      updated_at = NOW()`;
    const params = [
      egais_enabled ?? false, egais_utm_host || 'localhost', egais_utm_port || 8080,
      egais_fsrar_id || null,
      chestniy_znak_enabled ?? false, chestniy_znak_omsid || null,
      chestniy_znak_environment || 'sandbox',
      edo_enabled ?? false, edo_provider || null, edo_sbis_login || null,
      edo_sbis_app_client_id || null, edo_diadoc_login || null, edo_diadoc_box_id || null,
      kkt_enabled ?? false, kkt_provider || null, kkt_strict_mode ?? false, kkt_default_vat || 'none',
      kkt_group_code || null, kkt_login || null, kkt_inn || null, kkt_payment_address || null, kkt_sno || null,
    ];

    // Секретные поля — обновляем только если не маска
    const secrets = [
      ['chestniy_znak_token', notMask(chestniy_znak_token)],
      ['edo_sbis_password', notMask(edo_sbis_password)],
      ['edo_sbis_app_secret', notMask(edo_sbis_app_secret)],
      ['edo_diadoc_api_key', notMask(edo_diadoc_api_key)],
      ['edo_diadoc_password', notMask(edo_diadoc_password)],
      ['kkt_password', notMask(kkt_password)],
    ];
    for (const [col, val] of secrets) {
      if (val !== undefined) {
        sql += `, ${col} = $${params.length + 1}`;
        params.push(val);
      }
    }

    sql += ` WHERE tenant_id = $${params.length + 1}`;
    params.push(req.tenantId);

    await run(sql, params);
  } else {
    await run(
      `INSERT INTO tenant_integrations (tenant_id, egais_enabled, egais_utm_host, egais_utm_port, egais_fsrar_id,
        chestniy_znak_enabled, chestniy_znak_token, chestniy_znak_omsid, chestniy_znak_environment,
        edo_enabled, edo_provider, edo_sbis_login, edo_sbis_password, edo_sbis_app_client_id, edo_sbis_app_secret,
        edo_diadoc_api_key, edo_diadoc_login, edo_diadoc_password, edo_diadoc_box_id,
        kkt_enabled, kkt_provider, kkt_strict_mode, kkt_default_vat, kkt_group_code, kkt_login, kkt_password,
        kkt_inn, kkt_payment_address, kkt_sno)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)`,
      [
        req.tenantId,
        egais_enabled ?? false, egais_utm_host || 'localhost', egais_utm_port || 8080,
        egais_fsrar_id || null,
        chestniy_znak_enabled ?? false, notMask(chestniy_znak_token) || null,
        chestniy_znak_omsid || null, chestniy_znak_environment || 'sandbox',
        edo_enabled ?? false, edo_provider || null, edo_sbis_login || null,
        notMask(edo_sbis_password) || null, edo_sbis_app_client_id || null, notMask(edo_sbis_app_secret) || null,
        notMask(edo_diadoc_api_key) || null, edo_diadoc_login || null,
        notMask(edo_diadoc_password) || null, edo_diadoc_box_id || null,
        kkt_enabled ?? false, kkt_provider || null, kkt_strict_mode ?? false, kkt_default_vat || 'none',
        kkt_group_code || null, kkt_login || null, notMask(kkt_password) || null,
        kkt_inn || null, kkt_payment_address || null, kkt_sno || null,
      ]
    );
  }

  invalidateIntegration(req.tenantId);
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

// Тест подключения ККТ
router.post('/test-kkt', ownerOnly, async (req, res) => {
  try {
    const integrations = await get(
      'SELECT * FROM tenant_integrations WHERE tenant_id = $1',
      [req.tenantId]
    );
    if (!integrations || !integrations.kkt_provider) {
      return res.json({ success: false, message: 'Сначала сохраните настройки ККТ и выберите провайдер' });
    }
    const KktService = require('../services/kkt');
    const kkt = new KktService(req.tenantId, integrations);
    const result = await kkt.testConnection();
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;
