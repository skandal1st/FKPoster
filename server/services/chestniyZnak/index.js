/**
 * ChestniyZnakService — бизнес-логика работы с Честным знаком (ИС МП)
 *
 * Все операции логируются в chestniy_znak_operations.
 * Ошибки API не блокируют POS-операции.
 */

const CrptApiClient = require('./apiClient');
const { parseDataMatrix } = require('./dataMatrix');
const { run } = require('../../db');

class ChestniyZnakService {
  constructor(tenantId, integrations) {
    this.tenantId = tenantId;
    this.client = new CrptApiClient(
      integrations.chestniy_znak_token,
      integrations.chestniy_znak_omsid,
      integrations.chestniy_znak_environment || 'sandbox'
    );
  }

  // Приёмка маркированных товаров
  async acceptMarkedItems(markingCodes, inn) {
    return this._executeOperation('acceptance', markingCodes, async () => {
      return this.client.reportAcceptance(markingCodes, inn);
    });
  }

  // Продажа (вывод из оборота)
  async reportSale(markingCodes, inn) {
    return this._executeOperation('sale', markingCodes, async () => {
      return this.client.reportSale(markingCodes, inn);
    });
  }

  // Списание
  async writeOff(markingCodes, inn, reason) {
    return this._executeOperation('write_off', markingCodes, async () => {
      return this.client.reportWriteOff(markingCodes, inn, reason);
    });
  }

  // Проверить код маркировки через API
  async checkCode(cis) {
    try {
      const result = await this.client.getCisInfo(cis);
      return result;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // Распарсить DataMatrix код
  parseCode(code) {
    return parseDataMatrix(code);
  }

  // Выполнить операцию с логированием
  async _executeOperation(operationType, markingCodes, apiCall) {
    const opResult = await run(
      `INSERT INTO chestniy_znak_operations (tenant_id, operation_type, marking_codes, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [this.tenantId, operationType, markingCodes]
    );

    try {
      const result = await apiCall();

      if (result.ok) {
        await run(
          `UPDATE chestniy_znak_operations SET status = 'success', response_body = $1 WHERE id = $2`,
          [JSON.stringify(result.data), opResult.id]
        );
        return { success: true, operationId: opResult.id };
      } else {
        const errMsg = result.error || `HTTP ${result.status}`;
        await run(
          `UPDATE chestniy_znak_operations SET status = 'error', error_message = $1, response_body = $2 WHERE id = $3`,
          [errMsg, JSON.stringify(result.data || {}), opResult.id]
        );
        return { success: false, error: errMsg, operationId: opResult.id };
      }
    } catch (err) {
      await run(
        `UPDATE chestniy_znak_operations SET status = 'error', error_message = $1 WHERE id = $2`,
        [err.message, opResult.id]
      );
      return { success: false, error: err.message, operationId: opResult.id };
    }
  }
}

module.exports = ChestniyZnakService;
