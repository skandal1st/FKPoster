const { get } = require('../db');
const { integrationByTenant } = require('../cache');

async function loadIntegrations(req, res, next) {
  if (!req.tenantId) return next();

  try {
    let integrations = integrationByTenant.get(req.tenantId);
    if (integrations === undefined) {
      integrations = await get(
        'SELECT * FROM tenant_integrations WHERE tenant_id = $1',
        [req.tenantId]
      );
      integrationByTenant.set(req.tenantId, integrations);
    }
    req.integrations = integrations || {
      egais_enabled: false,
      chestniy_znak_enabled: false,
      kkt_enabled: false,
    };
  } catch (err) {
    req.integrations = { egais_enabled: false, chestniy_znak_enabled: false, kkt_enabled: false };
  }

  next();
}

function requireEgais(req, res, next) {
  if (!req.integrations || !req.integrations.egais_enabled) {
    return res.status(403).json({ error: 'Интеграция ЕГАИС не включена' });
  }
  next();
}

function requireChestniyZnak(req, res, next) {
  if (!req.integrations || !req.integrations.chestniy_znak_enabled) {
    return res.status(403).json({ error: 'Интеграция Честный знак не включена' });
  }
  next();
}

function requireEdo(req, res, next) {
  if (!req.integrations || !req.integrations.edo_enabled) {
    return res.status(403).json({ error: 'Интеграция ЭДО не включена' });
  }
  if (!req.integrations.edo_provider) {
    return res.status(403).json({ error: 'Не выбран провайдер ЭДО (СБИС или Диадок)' });
  }
  next();
}

function requireKkt(req, res, next) {
  if (!req.integrations || !req.integrations.kkt_enabled) {
    return res.status(403).json({ error: 'Интеграция ККТ не включена' });
  }
  if (!req.integrations.kkt_provider) {
    return res.status(403).json({ error: 'Не выбран провайдер ККТ' });
  }
  next();
}

module.exports = { loadIntegrations, requireEgais, requireChestniyZnak, requireEdo, requireKkt };
