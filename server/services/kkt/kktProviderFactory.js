/**
 * Фабрика провайдеров ККТ
 *
 * Возвращает экземпляр AtolProvider (или будущих провайдеров)
 * на основе настроек интеграции тенанта.
 */

const AtolProvider = require('./providers/atolProvider');

function createKktProvider(integrations) {
  const provider = integrations.kkt_provider;

  if (provider === 'atol') {
    return new AtolProvider({
      login: integrations.kkt_login,
      password: integrations.kkt_password,
      groupCode: integrations.kkt_group_code,
      inn: integrations.kkt_inn,
      paymentAddress: integrations.kkt_payment_address,
      sno: integrations.kkt_sno,
      callbackUrl: integrations.kkt_callback_url,
      cachedToken: integrations.kkt_token,
      tokenExpiresAt: integrations.kkt_token_expires_at,
      environment: integrations.kkt_environment,
    });
  }

  throw new Error(`Неизвестный ККТ-провайдер: ${provider}`);
}

module.exports = { createKktProvider };
