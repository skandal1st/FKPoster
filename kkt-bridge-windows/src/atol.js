const axios = require('axios');

/**
 * Клиент для АТОЛ Драйвера ККТ 10 через WebRequests API
 * Документация: https://integration.atol.ru/api/#webrequests
 * Локальный адрес: http://127.0.0.1:16732
 */
class AtolClient {
  constructor({ host, login, password, onStatusChange }) {
    this.host = host || 'http://127.0.0.1:16732';
    this.login = login || 'Admin';
    this.password = password || 'Admin';
    this.onStatusChange = onStatusChange || (() => {});
    this._ready = false;
    this._authHeader = 'Basic ' + Buffer.from(`${this.login}:${this.password}`).toString('base64');

    // Периодическая проверка статуса ККТ
    this._healthInterval = setInterval(() => this._checkHealth(), 10000);
    this._checkHealth();
  }

  isReady() {
    return this._ready;
  }

  destroy() {
    clearInterval(this._healthInterval);
  }

  async _request(payload) {
    const response = await axios.post(this.host, payload, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': this._authHeader,
      },
      timeout: 30000,
    });
    return response.data;
  }

  async _checkHealth() {
    try {
      await this.getStatus();
      const wasReady = this._ready;
      this._ready = true;
      if (!wasReady) this.onStatusChange();
    } catch {
      const wasReady = this._ready;
      this._ready = false;
      if (wasReady) this.onStatusChange();
    }
  }

  // Получить статус ККТ
  async getStatus() {
    const uuid = require('crypto').randomUUID();
    const result = await this._request({
      uuid,
      request: [{ type: 'getDeviceStatus' }],
    });
    return result?.results?.[0];
  }

  // Открыть смену
  async openShift({ operatorName = 'Кассир', operatorInn = '' } = {}) {
    const uuid = require('crypto').randomUUID();
    const result = await this._request({
      uuid,
      request: [{
        type: 'openShift',
        operator: { name: operatorName, vatin: operatorInn },
      }],
    });
    this._checkResult(result, 'openShift');
    return result.results[0];
  }

  // Закрыть смену (Z-отчёт)
  async closeShift({ operatorName = 'Кассир', operatorInn = '' } = {}) {
    const uuid = require('crypto').randomUUID();
    const result = await this._request({
      uuid,
      request: [{
        type: 'closeShift',
        operator: { name: operatorName, vatin: operatorInn },
      }],
    });
    this._checkResult(result, 'closeShift');
    return result.results[0];
  }

  // X-отчёт (без закрытия смены)
  async printXReport() {
    const uuid = require('crypto').randomUUID();
    const result = await this._request({
      uuid,
      request: [{ type: 'reportX' }],
    });
    this._checkResult(result, 'reportX');
    return result.results[0];
  }

  /**
   * Печать фискального чека
   * @param {string} receiptType  'sell' | 'sell_return' | 'open_shift' | 'close_shift' | 'x_report'
   * @param {object} data  данные из kkt_physical_queue.receipt_data
   */
  async printReceipt(receiptType, data) {
    if (receiptType === 'open_shift') return this.openShift(data);
    if (receiptType === 'close_shift') return this.closeShift(data);
    if (receiptType === 'x_report') return this.printXReport();

    const uuid = require('crypto').randomUUID();
    const atolType = receiptType === 'sell_return' ? 'sellReturn' : 'sell';

    // Формируем позиции чека
    const items = (data.items || []).map((item) => ({
      name: item.name,
      price: Number(item.price),
      quantity: Number(item.quantity) || 1,
      amount: Number(item.amount || item.price * item.quantity),
      measurementUnit: item.unit || 'шт',
      paymentMethod: 'fullPayment',
      paymentObject: 'commodity',
      tax: { type: item.vat || 'none' },
    }));

    // Формируем способы оплаты
    const payments = [];
    if (data.paid_cash > 0) {
      payments.push({ type: 'cash', sum: Number(data.paid_cash) });
    }
    if (data.paid_card > 0) {
      payments.push({ type: 'electronically', sum: Number(data.paid_card) });
    }
    if (payments.length === 0) {
      payments.push({ type: data.payment_method === 'card' ? 'electronically' : 'cash', sum: Number(data.total) });
    }

    const requestBody = {
      uuid,
      request: [{
        type: atolType,
        taxationType: data.tax_system || 'osn',
        operator: {
          name: data.operator_name || 'Кассир',
          vatin: data.operator_inn || '',
        },
        items,
        payments,
        total: Number(data.total),
      }],
    };

    // Добавить email/телефон если есть
    if (data.email) requestBody.request[0].clientInfo = { emailOrPhone: data.email };

    const result = await this._request(requestBody);
    this._checkResult(result, atolType);

    const res = result.results[0];
    return {
      fiscal_number: String(res.fiscalReceiptNumber || ''),
      fiscal_document_number: String(res.documentNumber || ''),
      fiscal_sign: String(res.fiscalDocumentSign || ''),
    };
  }

  _checkResult(result, type) {
    const res = result?.results?.[0];
    if (!res) throw new Error(`Нет ответа от АТОЛ Драйвера (${type})`);
    if (res.status !== 'ready' && res.status !== 'ok') {
      throw new Error(res.errorDescription || `Ошибка АТОЛ: ${res.status} (${type})`);
    }
  }
}

module.exports = AtolClient;
