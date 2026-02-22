/**
 * HTTP-клиент к ЕГАИС УТМ (Универсальный Транспортный Модуль)
 * УТМ работает на локальной машине заведения, REST API на порту 8080
 *
 * Основные эндпоинты:
 * GET  /opt/in          — входящие документы
 * GET  /opt/in/{docId}  — получить конкретный документ
 * DELETE /opt/in/{docId} — удалить входящий документ после обработки
 * POST /opt/out         — отправить исходящий документ
 * GET  /opt/out         — статус исходящих документов
 */

class UtmClient {
  constructor(host = 'localhost', port = 8080) {
    this.baseUrl = `http://${host}:${port}`;
  }

  async _fetch(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {},
    };

    if (body) {
      options.headers['Content-Type'] = 'application/xml';
      options.body = body;
    }

    try {
      const response = await fetch(url, options);
      const text = await response.text();

      return {
        ok: response.ok,
        status: response.status,
        data: text,
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

  // Получить список входящих документов
  async getIncoming() {
    return this._fetch('GET', '/opt/in');
  }

  // Получить конкретный входящий документ
  async getIncomingDoc(docId) {
    return this._fetch('GET', `/opt/in/${docId}`);
  }

  // Удалить входящий документ (после обработки)
  async deleteIncomingDoc(docId) {
    return this._fetch('DELETE', `/opt/in/${docId}`);
  }

  // Отправить исходящий документ (XML)
  async sendDocument(xml) {
    return this._fetch('POST', '/opt/out', xml);
  }

  // Получить статус исходящих документов
  async getOutgoing() {
    return this._fetch('GET', '/opt/out');
  }

  // Проверить доступность УТМ
  async ping() {
    try {
      const result = await this._fetch('GET', '/');
      return { available: result.ok || result.status > 0, status: result.status };
    } catch {
      return { available: false };
    }
  }
}

module.exports = UtmClient;
