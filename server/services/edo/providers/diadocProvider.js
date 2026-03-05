/**
 * Диадок (diadoc-api.kontur.ru) — клиент API ЭДО
 *
 * Реализует общий интерфейс провайдера ЭДО.
 * Авторизация по apiKey + логин/пароль.
 */

const DIADOC_API_BASE = 'https://diadoc-api.kontur.ru';

class DiadocProvider {
  constructor({ apiKey, login, password, boxId }) {
    this.apiKey = apiKey;
    this.login = login;
    this.password = password;
    this.boxId = boxId;
    this.token = null;
  }

  async _fetch(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': this.token ? `DiadocAuth ddauth_api_client_id=${this.apiKey},ddauth_token=${this.token}` : '',
      ...options.headers,
    };

    const res = await fetch(`${DIADOC_API_BASE}${url}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Диадок API ошибка ${res.status}: ${text.slice(0, 200)}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  async authenticate() {
    const res = await fetch(`${DIADOC_API_BASE}/V3/Authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `DiadocAuth ddauth_api_client_id=${this.apiKey}`,
      },
      body: JSON.stringify({
        login: this.login,
        password: this.password,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ошибка аутентификации Диадок: ${text.slice(0, 200)}`);
    }

    this.token = await res.text();
    if (!this.token) {
      throw new Error('Не удалось получить токен Диадок');
    }
    return { success: true };
  }

  async _ensureAuth() {
    if (!this.token) {
      await this.authenticate();
    }
  }

  async sendDocument(document) {
    await this._ensureAuth();

    const data = await this._fetch(`/V3/PostMessage`, {
      method: 'POST',
      body: JSON.stringify({
        FromBoxId: this.boxId,
        ToBoxId: document.buyer?.edo_id,
        DocumentAttachments: [{
          TypeNamedId: document.doc_type === 'upd' ? 'UniversalTransferDocument' : 'WriteOffAct',
          SignedContent: {
            Content: Buffer.from(JSON.stringify(document)).toString('base64'),
          },
          Metadata: {
            DocumentNumber: document.doc_number,
            DocumentDate: document.doc_date,
          },
        }],
      }),
    });

    return {
      success: true,
      externalDocId: data.MessageId || data.EntityId,
    };
  }

  async getIncomingDocuments(filters = {}) {
    await this._ensureAuth();

    const params = new URLSearchParams();
    params.set('boxId', this.boxId);
    if (filters.dateFrom) params.set('timestampFrom', new Date(filters.dateFrom).toISOString());
    if (filters.dateTo) params.set('timestampTo', new Date(filters.dateTo).toISOString());

    const data = await this._fetch(`/V3/GetDocuments?${params.toString()}&filterCategory=Any.InboundNotRevoked`);

    return (data.Documents || []).map((doc) => ({
      externalDocId: doc.EntityId || doc.MessageId,
      docType: doc.TypeNamedId,
      docNumber: doc.DocumentNumber,
      docDate: doc.DocumentDate,
      status: doc.RecipientResponseStatus,
      counterpartyInn: doc.CounteragentBoxId,
      counterpartyName: doc.Title,
      totalWithVat: doc.TotalWithVat ? parseFloat(doc.TotalWithVat) : null,
      totalWithoutVat: doc.TotalWithoutVat ? parseFloat(doc.TotalWithoutVat) : null,
      vatAmount: doc.Vat ? parseFloat(doc.Vat) : null,
      items: [],
      rawContent: JSON.stringify(doc),
    }));
  }

  async getDocument(externalId) {
    await this._ensureAuth();
    const data = await this._fetch(`/V3/GetDocument?boxId=${this.boxId}&messageId=${externalId}`);
    return {
      externalDocId: data.EntityId || data.MessageId,
      docType: data.TypeNamedId,
      docNumber: data.DocumentNumber,
      docDate: data.DocumentDate,
      status: data.RecipientResponseStatus,
      counterpartyInn: data.CounteragentBoxId,
      counterpartyName: data.Title,
      totalWithVat: data.TotalWithVat ? parseFloat(data.TotalWithVat) : null,
      items: [],
      rawContent: JSON.stringify(data),
    };
  }

  async signDocument(externalId) {
    await this._ensureAuth();
    await this._fetch(`/V3/PostMessagePatch`, {
      method: 'POST',
      body: JSON.stringify({
        BoxId: this.boxId,
        MessageId: externalId,
        RecipientTitles: [{ ParentEntityId: externalId }],
      }),
    });
    return { success: true };
  }

  async rejectDocument(externalId, reason) {
    await this._ensureAuth();
    await this._fetch(`/V3/PostMessagePatch`, {
      method: 'POST',
      body: JSON.stringify({
        BoxId: this.boxId,
        MessageId: externalId,
        RequestedSignatureRejections: [{
          ParentEntityId: externalId,
          Comment: reason,
        }],
      }),
    });
    return { success: true };
  }

  async findCounterparty(inn) {
    await this._ensureAuth();
    const data = await this._fetch(`/GetCounteragents?myOrgId=${this.boxId}&counteragentStatus=IsMyCounteragent&inn=${encodeURIComponent(inn)}`);
    return (data.Counteragents || []).map((c) => ({
      edoId: c.Organization?.Boxes?.[0]?.BoxId,
      name: c.Organization?.FullName || c.Organization?.ShortName,
      inn: c.Organization?.Inn,
      kpp: c.Organization?.Kpp,
    }));
  }

  async testConnection() {
    try {
      await this.authenticate();
      return { success: true, message: 'Подключение к Диадок установлено' };
    } catch (err) {
      return { success: false, message: `Ошибка подключения к Диадок: ${err.message}` };
    }
  }
}

module.exports = DiadocProvider;
