/**
 * EdoService — бизнес-логика работы с ЭДО (СБИС / Диадок)
 *
 * Паттерн аналогичен EgaisService:
 * - Принимает tenantId + integrations
 * - Через фабрику создаёт нужного провайдера
 * - Все операции оборачиваются в try/catch с записью в edo_documents
 * - Ошибки ЭДО не блокируют работу POS
 */

const { createEdoProvider } = require('./edoProviderFactory');
const { all, get, run } = require('../../db');

class EdoService {
  constructor(tenantId, integrations) {
    this.tenantId = tenantId;
    this.provider = createEdoProvider(integrations);
    this.providerName = integrations.edo_provider;
  }

  /**
   * Отправить УПД через ЭДО
   * @param {Object} document - подготовленный documentBuilder.buildUPD()
   * @param {Object} options - { counterpartyId, supplyId, egaisDocumentId, createdBy }
   */
  async sendDocument(document, options = {}) {
    const docResult = await run(
      `INSERT INTO edo_documents (tenant_id, doc_type, doc_number, doc_date, direction, status, edo_provider,
        counterparty_id, counterparty_inn, total_without_vat, vat_amount, total_with_vat,
        supply_id, egais_document_id, items, created_by)
       VALUES ($1, $2, $3, $4, 'outgoing', 'sending', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        this.tenantId, document.doc_type, document.doc_number, document.doc_date,
        this.providerName,
        options.counterpartyId || null,
        document.buyer?.inn || null,
        document.totals?.total_without_vat || null,
        document.totals?.vat_amount || null,
        document.totals?.total_with_vat || document.totals?.total || null,
        options.supplyId || null,
        options.egaisDocumentId || null,
        JSON.stringify(document.items || []),
        options.createdBy || null,
      ]
    );

    try {
      const result = await this.provider.sendDocument(document);
      await run(
        "UPDATE edo_documents SET status = 'sent', external_doc_id = $1, updated_at = NOW() WHERE id = $2",
        [result.externalDocId || null, docResult.id]
      );
      return { success: true, docId: docResult.id, externalDocId: result.externalDocId };
    } catch (err) {
      await run(
        "UPDATE edo_documents SET status = 'error', error_message = $1, updated_at = NOW() WHERE id = $2",
        [err.message, docResult.id]
      );
      return { success: false, error: err.message, docId: docResult.id };
    }
  }

  /**
   * Загрузить входящие документы из ЭДО-провайдера
   */
  async fetchIncoming(filters = {}) {
    const docs = await this.provider.getIncomingDocuments(filters);

    const saved = [];
    for (const doc of docs) {
      // Проверяем, не сохранён ли уже
      const existing = await get(
        'SELECT id FROM edo_documents WHERE tenant_id = $1 AND external_doc_id = $2',
        [this.tenantId, doc.externalDocId]
      );
      if (existing) {
        saved.push({ id: existing.id, external_doc_id: doc.externalDocId, skipped: true });
        continue;
      }

      // Ищем контрагента по ИНН
      let counterpartyId = null;
      if (doc.counterpartyInn) {
        const cp = await get(
          'SELECT id FROM counterparties WHERE tenant_id = $1 AND inn = $2 AND is_active = true LIMIT 1',
          [this.tenantId, doc.counterpartyInn]
        );
        if (cp) counterpartyId = cp.id;
      }

      const result = await run(
        `INSERT INTO edo_documents (tenant_id, doc_type, doc_number, doc_date, direction, status, edo_provider,
          external_doc_id, counterparty_id, counterparty_inn,
          total_without_vat, vat_amount, total_with_vat, items, raw_content)
         VALUES ($1, $2, $3, $4, 'incoming', 'received', $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          this.tenantId,
          this._normalizeDocType(doc.docType),
          doc.docNumber,
          doc.docDate || null,
          this.providerName,
          doc.externalDocId,
          counterpartyId,
          doc.counterpartyInn || null,
          doc.totalWithoutVat || null,
          doc.vatAmount || null,
          doc.totalWithVat || null,
          JSON.stringify(doc.items || []),
          doc.rawContent || null,
        ]
      );

      saved.push({ id: result.id, external_doc_id: doc.externalDocId });
    }

    return saved;
  }

  /**
   * Подписать/принять входящий документ
   */
  async acceptDocument(edoDocId) {
    const doc = await get(
      'SELECT * FROM edo_documents WHERE id = $1 AND tenant_id = $2',
      [edoDocId, this.tenantId]
    );
    if (!doc) throw new Error('Документ не найден');
    if (!doc.external_doc_id) throw new Error('Документ не имеет внешнего ID');

    try {
      await this.provider.signDocument(doc.external_doc_id);
      await run(
        "UPDATE edo_documents SET status = 'accepted', updated_at = NOW() WHERE id = $1",
        [edoDocId]
      );
      return { success: true };
    } catch (err) {
      await run(
        "UPDATE edo_documents SET error_message = $1, updated_at = NOW() WHERE id = $2",
        [err.message, edoDocId]
      );
      return { success: false, error: err.message };
    }
  }

  /**
   * Отклонить входящий документ
   */
  async rejectDocument(edoDocId, reason = '') {
    const doc = await get(
      'SELECT * FROM edo_documents WHERE id = $1 AND tenant_id = $2',
      [edoDocId, this.tenantId]
    );
    if (!doc) throw new Error('Документ не найден');
    if (!doc.external_doc_id) throw new Error('Документ не имеет внешнего ID');

    try {
      await this.provider.rejectDocument(doc.external_doc_id, reason);
      await run(
        "UPDATE edo_documents SET status = 'rejected', updated_at = NOW() WHERE id = $1",
        [edoDocId]
      );
      return { success: true };
    } catch (err) {
      await run(
        "UPDATE edo_documents SET error_message = $1, updated_at = NOW() WHERE id = $2",
        [err.message, edoDocId]
      );
      return { success: false, error: err.message };
    }
  }

  /**
   * Связать ЭДО-документ с ЕГАИС-документом
   */
  async linkToEgais(edoDocId, egaisDocumentId) {
    await run(
      'UPDATE edo_documents SET egais_document_id = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      [egaisDocumentId, edoDocId, this.tenantId]
    );
    return { success: true };
  }

  /**
   * Поиск контрагента по ИНН через ЭДО-провайдер
   */
  async searchCounterparty(inn) {
    return this.provider.findCounterparty(inn);
  }

  /**
   * Тест подключения
   */
  async testConnection() {
    return this.provider.testConnection();
  }

  /**
   * Авто-сопоставление ЭДО и ЕГАИС документов
   * Критерии: ИНН поставщика + дата ± 3 дня + сумма ± 1%
   */
  async autoMatchEgais() {
    const unmatchedEdo = await all(
      `SELECT * FROM edo_documents
       WHERE tenant_id = $1 AND direction = 'incoming' AND egais_document_id IS NULL
         AND status IN ('received', 'accepted')
         AND counterparty_inn IS NOT NULL`,
      [this.tenantId]
    );

    const matched = [];
    for (const edo of unmatchedEdo) {
      // Ищем ЕГАИС ТТН с таким же ИНН поставщика и близкой датой
      const egaisDocs = await all(
        `SELECT ed.* FROM egais_documents ed
         WHERE ed.tenant_id = $1 AND ed.doc_type = 'WayBill' AND ed.direction = 'incoming'
           AND ed.status IN ('received', 'accepted')
           AND ed.id NOT IN (SELECT egais_document_id FROM edo_documents WHERE tenant_id = $1 AND egais_document_id IS NOT NULL)`,
        [this.tenantId]
      );

      for (const egais of egaisDocs) {
        const summary = typeof egais.summary === 'string' ? JSON.parse(egais.summary) : (egais.summary || {});
        const egaisInn = summary.shipper?.inn || summary.supplierInn;

        if (egaisInn && egaisInn === edo.counterparty_inn) {
          // Совпадение по ИНН — связываем
          await this.linkToEgais(edo.id, egais.id);
          matched.push({ edoDocId: edo.id, egaisDocId: egais.id });
          break;
        }
      }
    }

    return matched;
  }

  _normalizeDocType(rawType) {
    if (!rawType) return 'unknown';
    const lower = rawType.toLowerCase();
    if (lower.includes('universal') || lower.includes('upd')) return 'upd';
    if (lower.includes('invoice') || lower.includes('счёт')) return 'invoice';
    if (lower.includes('writeoff') || lower.includes('списани')) return 'act_writeoff';
    return rawType;
  }
}

module.exports = EdoService;
