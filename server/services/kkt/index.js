/**
 * KktService — бизнес-логика работы с ККТ (АТОЛ Онлайн)
 *
 * Паттерн аналогичен EdoService:
 * - Принимает tenantId + integrations
 * - Через фабрику создаёт нужного провайдера
 * - Все операции оборачиваются в try/catch с записью в kkt_receipts
 */

const { createKktProvider } = require('./kktProviderFactory');
const { all, get, run } = require('../../db');
const { invalidateIntegration } = require('../../cache');

class KktService {
  constructor(tenantId, integrations) {
    this.tenantId = tenantId;
    this.provider = createKktProvider(integrations);
    this.providerName = integrations.kkt_provider;
    this.strictMode = integrations.kkt_strict_mode || false;
    this.defaultVat = integrations.kkt_default_vat || 'none';
    this.inn = integrations.kkt_inn;
    this.paymentAddress = integrations.kkt_payment_address;
    this.sno = integrations.kkt_sno || 'osn';

    // Сохранение токена АТОЛ в БД при обновлении
    this.provider.onTokenUpdate(async (token, expiresAt) => {
      await this._persistToken(token, expiresAt);
    });
  }

  /**
   * Создать чек продажи
   * @param {Object} orderData - { orderId, total, paidCash, paidCard }
   * @param {Array} orderItems - позиции заказа с vat_rate
   * @param {string} cashierName - имя кассира
   */
  async createSellReceipt(orderData, orderItems, cashierName) {
    return this._createReceipt('sell', orderData, orderItems, cashierName);
  }

  /**
   * Создать чек возврата
   */
  async createRefundReceipt(orderData, orderItems, cashierName) {
    return this._createReceipt('sell_refund', orderData, orderItems, cashierName);
  }

  async _createReceipt(type, orderData, orderItems, _cashierName) {
    const { orderId, total, paidCash, paidCard, clientPhone } = orderData;
    const totalNum = parseFloat(total) || 0;

    // Формируем позиции чека с распределением скидки
    const itemsTotal = orderItems.reduce((s, i) => s + parseFloat(i.total || 0), 0);
    const hasDiscount = itemsTotal > 0 && totalNum < itemsTotal;
    const discountRatio = hasDiscount ? totalNum / itemsTotal : 1;

    const receiptItems = orderItems.map((item, idx) => {
      const itemTotal = parseFloat(item.total || 0);
      let sum;
      if (hasDiscount) {
        // Последняя позиция забирает остаток для точного совпадения
        if (idx === orderItems.length - 1) {
          const prevSum = orderItems.slice(0, -1).reduce((s, i) => {
            return s + Math.round(parseFloat(i.total || 0) * discountRatio * 100) / 100;
          }, 0);
          sum = Math.round((totalNum - prevSum) * 100) / 100;
        } else {
          sum = Math.round(itemTotal * discountRatio * 100) / 100;
        }
      } else {
        sum = Math.round(itemTotal * 100) / 100;
      }

      const price = Math.round((sum / (parseFloat(item.quantity) || 1)) * 100) / 100;
      const vatType = item.vat_rate || this.defaultVat;

      return {
        name: item.product_name,
        price,
        quantity: parseFloat(item.quantity) || 1,
        sum,
        measurement_unit: 'шт',
        payment_method: 'full_payment',
        payment_object: 'commodity',
        vat: { type: vatType },
      };
    });

    // Платежи
    const payments = [];
    const cashAmount = parseFloat(paidCash) || 0;
    const cardAmount = parseFloat(paidCard) || 0;
    if (cashAmount > 0) {
      payments.push({ type: 0, sum: cashAmount }); // наличные
    }
    if (cardAmount > 0) {
      payments.push({ type: 1, sum: cardAmount }); // безналичный
    }
    // Если оба 0, значит полная оплата одним способом
    if (payments.length === 0) {
      payments.push({ type: 1, sum: totalNum });
    }

    const now = new Date();
    const timestamp = now.toLocaleString('ru', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).replace(',', '');

    const payload = {
      external_id: `order-${orderId}-${Date.now()}`,
      receipt: {
        client: { email: 'receipt@hookahpos.ru', phone: clientPhone || '' },
        company: {
          sno: this.sno,
          inn: this.inn,
          payment_address: this.paymentAddress,
        },
        items: receiptItems,
        payments,
        total: totalNum,
      },
      timestamp,
    };

    // Создаём запись в БД
    const receiptResult = await run(
      `INSERT INTO kkt_receipts (tenant_id, order_id, receipt_type, status, total, payment_method, kkt_provider, request_payload)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7) RETURNING id`,
      [
        this.tenantId, orderId, type, totalNum,
        cashAmount > 0 && cardAmount > 0 ? 'mixed' : (cashAmount > 0 ? 'cash' : 'card'),
        this.providerName, JSON.stringify(payload),
      ]
    );
    const receiptId = receiptResult.id;

    try {
      const method = type === 'sell' ? 'sell' : 'sellRefund';
      const result = await this.provider[method](payload);

      if (result.error) {
        await run(
          `UPDATE kkt_receipts SET status = 'error', error_message = $1, response_payload = $2, updated_at = NOW() WHERE id = $3`,
          [result.error.text || JSON.stringify(result.error), JSON.stringify(result), receiptId]
        );
        return { success: false, receiptId, error: result.error.text || 'Ошибка АТОЛ', receiptPending: false };
      }

      await run(
        `UPDATE kkt_receipts SET status = 'sent', external_uuid = $1, response_payload = $2, updated_at = NOW() WHERE id = $3`,
        [result.uuid, JSON.stringify(result), receiptId]
      );

      return { success: true, receiptId, uuid: result.uuid, receiptPending: true };
    } catch (err) {
      await run(
        `UPDATE kkt_receipts SET status = 'error', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [err.message, receiptId]
      );
      return { success: false, receiptId, error: err.message, receiptPending: false };
    }
  }

  /**
   * Проверить статус чека через getReport
   */
  async checkReceiptStatus(receiptId) {
    const receipt = await get(
      'SELECT * FROM kkt_receipts WHERE id = $1 AND tenant_id = $2',
      [receiptId, this.tenantId]
    );
    if (!receipt) throw new Error('Чек не найден');
    if (!receipt.external_uuid) throw new Error('Чек не имеет UUID');

    try {
      const report = await this.provider.getReport(receipt.external_uuid);

      if (!report.success) {
        return { success: false, error: report.error };
      }

      if (report.status === 'done') {
        await run(
          `UPDATE kkt_receipts SET status = 'done',
            fiscal_number = $1, fiscal_document = $2, fiscal_sign = $3,
            registration_number = $4, fn_number = $5, receipt_datetime = $6,
            response_payload = $7, updated_at = NOW()
           WHERE id = $8`,
          [
            report.fiscalNumber, report.fiscalDocument, report.fiscalSign,
            report.registrationNumber, report.fnNumber,
            report.receiptDatetime || null,
            JSON.stringify(report), receiptId,
          ]
        );
        return { success: true, status: 'done', fiscal: report };
      }

      return { success: true, status: report.status };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Повторная отправка ошибочного чека
   */
  async retryReceipt(receiptId) {
    const receipt = await get(
      "SELECT * FROM kkt_receipts WHERE id = $1 AND tenant_id = $2 AND status = 'error'",
      [receiptId, this.tenantId]
    );
    if (!receipt) throw new Error('Чек не найден или не в статусе ошибки');

    const payload = typeof receipt.request_payload === 'string'
      ? JSON.parse(receipt.request_payload)
      : receipt.request_payload;

    try {
      const method = receipt.receipt_type === 'sell' ? 'sell' : 'sellRefund';
      const result = await this.provider[method](payload);

      if (result.error) {
        await run(
          `UPDATE kkt_receipts SET error_message = $1, response_payload = $2, retry_count = retry_count + 1, updated_at = NOW() WHERE id = $3`,
          [result.error.text || JSON.stringify(result.error), JSON.stringify(result), receiptId]
        );
        return { success: false, error: result.error.text || 'Ошибка АТОЛ' };
      }

      await run(
        `UPDATE kkt_receipts SET status = 'sent', external_uuid = $1, error_message = NULL, response_payload = $2, retry_count = retry_count + 1, updated_at = NOW() WHERE id = $3`,
        [result.uuid, JSON.stringify(result), receiptId]
      );

      return { success: true, uuid: result.uuid };
    } catch (err) {
      await run(
        `UPDATE kkt_receipts SET error_message = $1, retry_count = retry_count + 1, updated_at = NOW() WHERE id = $2`,
        [err.message, receiptId]
      );
      return { success: false, error: err.message };
    }
  }

  /**
   * Список чеков для админ-страницы
   */
  async getReceipts(filters = {}) {
    let sql = 'SELECT kr.*, o.id as order_number FROM kkt_receipts kr LEFT JOIN orders o ON kr.order_id = o.id WHERE kr.tenant_id = $1';
    const params = [this.tenantId];
    let idx = 2;

    if (filters.status) {
      sql += ` AND kr.status = $${idx++}`;
      params.push(filters.status);
    }
    if (filters.dateFrom) {
      sql += ` AND kr.created_at >= $${idx++}`;
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      sql += ` AND kr.created_at <= $${idx++}`;
      params.push(filters.dateTo + ' 23:59:59');
    }

    sql += ` ORDER BY kr.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(Number(filters.limit) || 50, Number(filters.offset) || 0);

    return all(sql, params);
  }

  /**
   * Количество pending/error чеков (для бейджа)
   */
  async getPendingCount() {
    const row = await get(
      "SELECT COUNT(*) as count FROM kkt_receipts WHERE tenant_id = $1 AND status IN ('pending', 'error')",
      [this.tenantId]
    );
    return parseInt(row.count) || 0;
  }

  /**
   * Массовая проверка sent-чеков
   */
  async pollPendingReceipts() {
    const sentReceipts = await all(
      "SELECT id, external_uuid FROM kkt_receipts WHERE tenant_id = $1 AND status = 'sent' AND external_uuid IS NOT NULL ORDER BY created_at LIMIT 20",
      [this.tenantId]
    );

    const results = [];
    for (const receipt of sentReceipts) {
      const result = await this.checkReceiptStatus(receipt.id);
      results.push({ receiptId: receipt.id, ...result });
    }

    return results;
  }

  /**
   * Тест подключения
   */
  async testConnection() {
    return this.provider.testConnection();
  }

  /**
   * Сохранить токен АТОЛ в БД
   */
  async _persistToken(token, expiresAt) {
    await run(
      'UPDATE tenant_integrations SET kkt_token = $1, kkt_token_expires_at = $2 WHERE tenant_id = $3',
      [token, expiresAt, this.tenantId]
    );
    invalidateIntegration(this.tenantId);
  }
}

module.exports = KktService;
