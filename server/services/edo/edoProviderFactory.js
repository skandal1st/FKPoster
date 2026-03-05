/**
 * Фабрика провайдеров ЭДО
 *
 * Возвращает экземпляр SbisProvider или DiadocProvider
 * на основе настроек интеграции тенанта.
 */

const SbisProvider = require('./providers/sbisProvider');
const DiadocProvider = require('./providers/diadocProvider');

function createEdoProvider(integrations) {
  const provider = integrations.edo_provider;

  if (provider === 'sbis') {
    return new SbisProvider({
      login: integrations.edo_sbis_login,
      password: integrations.edo_sbis_password,
      appClientId: integrations.edo_sbis_app_client_id,
      appSecret: integrations.edo_sbis_app_secret,
    });
  }

  if (provider === 'diadoc') {
    return new DiadocProvider({
      apiKey: integrations.edo_diadoc_api_key,
      login: integrations.edo_diadoc_login,
      password: integrations.edo_diadoc_password,
      boxId: integrations.edo_diadoc_box_id,
    });
  }

  throw new Error(`Неизвестный ЭДО-провайдер: ${provider}`);
}

module.exports = { createEdoProvider };
