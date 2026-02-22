/**
 * HTTP-клиент к API CRPT (Честный знак / ИС МП)
 *
 * Окружения:
 * - sandbox: https://markirovka.sandbox.crpt.tech
 * - production: https://markirovka.crpt.ru
 *
 * Основные эндпоинты:
 * POST /api/v4/true-api/auth/key — получение ключа для аутентификации
 * POST /api/v4/true-api/auth/simpleSignIn — аутентификация
 * POST /api/v3/lk/documents/create — создание документа (вывод из оборота и т.д.)
 * GET  /api/v4/true-api/cises/info — информация по КИ (код идентификации)
 */

const ENVIRONMENTS = {
  sandbox: 'https://markirovka.sandbox.crpt.tech',
  production: 'https://markirovka.crpt.ru',
};

class CrptApiClient {
  constructor(token, omsId, environment = 'sandbox') {
    this.baseUrl = ENVIRONMENTS[environment] || ENVIRONMENTS.sandbox;
    this.token = token;
    this.omsId = omsId;
  }

  async _fetch(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      const data = await response.json().catch(() => ({}));

      return {
        ok: response.ok,
        status: response.status,
        data,
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: err.message,
        data: null,
      };
    }
  }

  // Получить информацию по коду маркировки
  async getCisInfo(cis) {
    return this._fetch('GET', `/api/v4/true-api/cises/info?cis=${encodeURIComponent(cis)}`);
  }

  // Создать документ (вывод из оборота при продаже)
  async createDocument(documentType, body) {
    return this._fetch('POST', `/api/v3/lk/documents/create?pg=${documentType}`, body);
  }

  // Вывод из оборота (продажа)
  async reportSale(markingCodes, inn) {
    const document = {
      inn,
      action_type: 'sale',
      document_type: 'LP_SHIP_GOODS',
      products: markingCodes.map((code) => ({
        cis: code,
        action: 'SALE',
      })),
    };

    return this.createDocument('tobacco', document);
  }

  // Приёмка маркированных товаров
  async reportAcceptance(markingCodes, inn) {
    const document = {
      inn,
      action_type: 'acceptance',
      document_type: 'LP_ACCEPT_GOODS',
      products: markingCodes.map((code) => ({
        cis: code,
        action: 'ACCEPT',
      })),
    };

    return this.createDocument('tobacco', document);
  }

  // Списание
  async reportWriteOff(markingCodes, inn, reason = 'Порча') {
    const document = {
      inn,
      action_type: 'write_off',
      document_type: 'LK_GTIN_RECEIPT',
      products: markingCodes.map((code) => ({
        cis: code,
        action: 'WRITE_OFF',
        write_off_reason: reason,
      })),
    };

    return this.createDocument('tobacco', document);
  }

  // Проверка доступности API
  async ping() {
    try {
      const result = await this._fetch('GET', '/api/v4/true-api/ping');
      return { available: result.ok, status: result.status };
    } catch {
      return { available: false };
    }
  }
}

module.exports = CrptApiClient;
