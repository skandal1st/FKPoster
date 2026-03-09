/**
 * АТОЛ Онлайн v4 — клиент API облачной ККТ
 *
 * Авторизация по логину/паролю интегратора.
 * Токен кешируется на 24 часа.
 */

const ATOL_API_BASE = 'https://online.atol.ru/possystem/v4';

class AtolProvider {
  constructor({ login, password, groupCode, inn, paymentAddress, sno, callbackUrl, cachedToken, tokenExpiresAt }) {
    this.login = login;
    this.password = password;
    this.groupCode = groupCode;
    this.inn = inn;
    this.paymentAddress = paymentAddress;
    this.sno = sno || 'osn';
    this.callbackUrl = callbackUrl || null;
    this.token = cachedToken || null;
    this.tokenExpiresAt = tokenExpiresAt ? new Date(tokenExpiresAt) : null;
    this._onTokenUpdate = null;
  }

  /**
   * Колбэк для сохранения нового токена в БД
   */
  onTokenUpdate(callback) {
    this._onTokenUpdate = callback;
  }

  async _ensureAuth() {
    if (this.token && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return;
    }
    await this.authenticate();
  }

  async authenticate() {
    const res = await fetch(`${ATOL_API_BASE}/getToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: this.login, pass: this.password }),
    });

    const data = await res.json().catch(() => ({}));

    if (data.error) {
      throw new Error(`АТОЛ авторизация: ${data.error.text || data.error.code || 'неизвестная ошибка'}`);
    }

    if (!data.token) {
      throw new Error('АТОЛ: не удалось получить токен');
    }

    this.token = data.token;
    // Токен АТОЛ живёт 24 часа
    this.tokenExpiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000);

    if (this._onTokenUpdate) {
      await this._onTokenUpdate(this.token, this.tokenExpiresAt);
    }

    return { success: true };
  }

  async _fetch(url, options = {}) {
    await this._ensureAuth();

    const headers = {
      'Content-Type': 'application/json',
      'Token': this.token,
      ...options.headers,
    };

    const res = await fetch(`${ATOL_API_BASE}${url}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`АТОЛ API ошибка ${res.status}: ${text.slice(0, 300)}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  /**
   * Отправить чек продажи
   */
  async sell(receiptBody) {
    const data = await this._fetch(`/${this.groupCode}/sell`, {
      method: 'POST',
      body: JSON.stringify(receiptBody),
    });

    return {
      uuid: data.uuid,
      status: data.status,
      error: data.error || null,
    };
  }

  /**
   * Отправить чек возврата прихода
   */
  async sellRefund(receiptBody) {
    const data = await this._fetch(`/${this.groupCode}/sell_refund`, {
      method: 'POST',
      body: JSON.stringify(receiptBody),
    });

    return {
      uuid: data.uuid,
      status: data.status,
      error: data.error || null,
    };
  }

  /**
   * Получить отчёт по UUID (фискальные данные)
   */
  async getReport(uuid) {
    const data = await this._fetch(`/${this.groupCode}/report/${uuid}`);

    if (data.error) {
      return { success: false, error: data.error.text || data.error.code };
    }

    const payload = data.payload || {};
    return {
      success: true,
      status: data.status,
      fiscalNumber: payload.fiscal_receipt_number?.toString() || null,
      fiscalDocument: payload.fiscal_document_number?.toString() || null,
      fiscalSign: payload.fiscal_document_attribute?.toString() || null,
      registrationNumber: payload.ecr_registration_number || null,
      fnNumber: payload.fn_number || null,
      receiptDatetime: payload.receipt_datetime || null,
      total: payload.total,
    };
  }

  /**
   * Тест подключения — аутентификация
   */
  async testConnection() {
    try {
      await this.authenticate();
      return { success: true, message: 'Подключение к АТОЛ Онлайн установлено' };
    } catch (err) {
      return { success: false, message: `Ошибка подключения к АТОЛ: ${err.message}` };
    }
  }
}

module.exports = AtolProvider;
