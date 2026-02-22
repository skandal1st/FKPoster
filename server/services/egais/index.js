/**
 * EgaisService — бизнес-логика работы с ЕГАИС
 *
 * Все операции оборачивают вызовы к УТМ в try/catch.
 * Ошибки не блокируют POS — логируются в egais_documents.
 */

const UtmClient = require('./utmClient');
const xmlBuilder = require('./xmlBuilder');
const xmlParser = require('./xmlParser');
const { all, get, run } = require('../../db');

class EgaisService {
  constructor(tenantId, integrations) {
    this.tenantId = tenantId;
    this.fsrarId = integrations.egais_fsrar_id;
    this.utm = new UtmClient(
      integrations.egais_utm_host || 'localhost',
      integrations.egais_utm_port || 8080
    );
  }

  // Получить входящие документы из УТМ
  async fetchIncoming() {
    const result = await this.utm.getIncoming();
    if (!result.ok) {
      throw new Error(`УТМ недоступен: ${result.error || result.status}`);
    }
    return xmlParser.parseIncomingList(result.data);
  }

  // Получить и обработать конкретный входящий документ
  async fetchIncomingDoc(docId) {
    const result = await this.utm.getIncomingDoc(docId);
    if (!result.ok) {
      throw new Error(`Не удалось получить документ ${docId}`);
    }

    // Пытаемся определить тип документа
    const xml = result.data;
    let parsed = null;
    let docType = 'unknown';

    if (xml.includes('WayBill')) {
      parsed = xmlParser.parseWayBill(xml);
      docType = 'WayBill';
    } else if (xml.includes('Ticket')) {
      parsed = xmlParser.parseTicket(xml);
      docType = 'Ticket';
    } else if (xml.includes('ReplyAP') || xml.includes('ReplySP')) {
      const regType = xml.includes('ReplyAP') ? 'reg1' : 'reg2';
      parsed = xmlParser.parseStockReply(xml, regType);
      docType = regType === 'reg1' ? 'ReplyAP' : 'ReplySP';
    }

    // Сохраняем в журнал
    await run(
      `INSERT INTO egais_documents (tenant_id, doc_type, direction, status, xml_content, summary, external_id)
       VALUES ($1, $2, 'incoming', 'received', $3, $4, $5) RETURNING id`,
      [this.tenantId, docType, xml, JSON.stringify(parsed || {}), docId]
    );

    return { docType, parsed, xml };
  }

  // Подтвердить ТТН
  async acceptTTN(wayBillId, note = '') {
    const xml = xmlBuilder.buildWayBillAct({
      fsrarId: this.fsrarId,
      isConfirm: true,
      wayBillId,
      note,
    });

    return this._sendDocument('WayBillAct', xml, { wayBillId, action: 'accept' });
  }

  // Отклонить ТТН
  async rejectTTN(wayBillId, note = '') {
    const xml = xmlBuilder.buildWayBillAct({
      fsrarId: this.fsrarId,
      isConfirm: false,
      wayBillId,
      note,
    });

    return this._sendDocument('WayBillAct', xml, { wayBillId, action: 'reject' });
  }

  // Переместить на Регистр 2 (в торговый зал)
  async transferToShop(items) {
    const xml = xmlBuilder.buildTransferToShop({
      fsrarId: this.fsrarId,
      items,
    });

    return this._sendDocument('TransferToShop', xml, { items: items.length });
  }

  // Списание
  async writeOff(items, note = '') {
    const xml = xmlBuilder.buildActWriteOff({
      fsrarId: this.fsrarId,
      items,
      note,
    });

    return this._sendDocument('ActWriteOff', xml, { items: items.length });
  }

  // Запросить остатки
  async queryRegisters(registerType = 'reg2') {
    const xml = xmlBuilder.buildQueryAP({
      fsrarId: this.fsrarId,
      registerType,
    });

    return this._sendDocument(registerType === 'reg1' ? 'QueryAP' : 'QuerySP', xml, { registerType });
  }

  // Синхронизировать кеш остатков из ответа УТМ
  async syncStockFromReply(stockItems, registerType) {
    // Очищаем старый кеш для данного регистра
    await run(
      'DELETE FROM egais_stock WHERE tenant_id = $1 AND register_type = $2',
      [this.tenantId, registerType]
    );

    for (const item of stockItems) {
      await run(
        `INSERT INTO egais_stock (tenant_id, register_type, egais_alcocode, product_name, quantity, inform_a_reg_id, inform_b_reg_id, last_synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [this.tenantId, registerType, item.alcocode, item.productName, item.quantity,
         item.informARegId || null, item.informBRegId || null]
      );
    }
  }

  // Получить кеш остатков
  async getStock(registerType) {
    return all(
      'SELECT * FROM egais_stock WHERE tenant_id = $1 AND register_type = $2 ORDER BY product_name',
      [this.tenantId, registerType]
    );
  }

  // Отправить документ в УТМ и сохранить в журнал
  async _sendDocument(docType, xml, summary) {
    const docResult = await run(
      `INSERT INTO egais_documents (tenant_id, doc_type, direction, status, xml_content, summary)
       VALUES ($1, $2, 'outgoing', 'sending', $3, $4) RETURNING id`,
      [this.tenantId, docType, xml, JSON.stringify(summary)]
    );

    try {
      const result = await this.utm.sendDocument(xml);

      if (result.ok) {
        await run(
          "UPDATE egais_documents SET status = 'sent', updated_at = NOW() WHERE id = $1",
          [docResult.id]
        );
        return { success: true, docId: docResult.id };
      } else {
        const errMsg = result.error || `HTTP ${result.status}`;
        await run(
          "UPDATE egais_documents SET status = 'error', error_message = $1, updated_at = NOW() WHERE id = $2",
          [errMsg, docResult.id]
        );
        return { success: false, error: errMsg, docId: docResult.id };
      }
    } catch (err) {
      await run(
        "UPDATE egais_documents SET status = 'error', error_message = $1, updated_at = NOW() WHERE id = $2",
        [err.message, docResult.id]
      );
      return { success: false, error: err.message, docId: docResult.id };
    }
  }
}

module.exports = EgaisService;
