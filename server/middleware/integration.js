const { get } = require('../db');

async function loadIntegrations(req, res, next) {
  if (!req.tenantId) return next();

  try {
    const integrations = await get(
      'SELECT * FROM tenant_integrations WHERE tenant_id = $1',
      [req.tenantId]
    );
    req.integrations = integrations || {
      egais_enabled: false,
      chestniy_znak_enabled: false,
    };
  } catch (err) {
    req.integrations = { egais_enabled: false, chestniy_znak_enabled: false };
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

module.exports = { loadIntegrations, requireEgais, requireChestniyZnak };
