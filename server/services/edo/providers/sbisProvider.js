/**
 * СБИС (api.sbis.ru) — клиент API ЭДО
 *
 * Реализует общий интерфейс провайдера ЭДО.
 * Авторизация по логину/паролю + appClientId/appSecret.
 * Сессия (sid) обновляется автоматически.
 */

const SBIS_API_BASE = 'https://online.sbis.ru';

class SbisProvider {
  constructor({ login, password, appClientId, appSecret }) {
    this.login = login;
    this.password = password;
    this.appClientId = appClientId;
    this.appSecret = appSecret;
    this.sid = null;
  }

  async _fetch(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (this.sid) {
      headers['X-SBISSessionID'] = this.sid;
    }

    const res = await fetch(`${SBIS_API_BASE}${url}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`СБИС API ошибка ${res.status}: ${text.slice(0, 200)}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  async authenticate() {
    const data = await this._fetch('/auth/service/', {
      method: 'POST',
      body: JSON.stringify({
        app: {
          client_id: this.appClientId,
          app_secret: this.appSecret,
        },
        login: this.login,
        password: this.password,
      }),
    });

    this.sid = data.sid || data.token;
    if (!this.sid) {
      throw new Error('Не удалось получить сессию СБИС');
    }
    return { success: true };
  }

  async _ensureAuth() {
    if (!this.sid) {
      await this.authenticate();
    }
  }

  async sendDocument(document) {
    await this._ensureAuth();

    const data = await this._fetch('/edo/v1/documents/send', {
      method: 'POST',
      body: JSON.stringify({
        document_type: document.doc_type === 'upd' ? 'UniversalTransferDocument' : 'WriteOffAct',
        number: document.doc_number,
        date: document.doc_date,
        buyer: document.buyer ? {
          inn: document.buyer.inn,
          kpp: document.buyer.kpp,
          name: document.buyer.name,
        } : undefined,
        items: document.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price,
          vat_rate: item.vat_rate,
          total: item.total,
        })),
        totals: document.totals,
      }),
    });

    return {
      success: true,
      externalDocId: data.id || data.document_id,
    };
  }

  async getIncomingDocuments(filters = {}) {
    await this._ensureAuth();

    const params = new URLSearchParams();
    if (filters.dateFrom) params.set('date_from', filters.dateFrom);
    if (filters.dateTo) params.set('date_to', filters.dateTo);
    if (filters.status) params.set('status', filters.status);

    const data = await this._fetch(`/edo/v1/documents/incoming?${params.toString()}`);

    return (data.documents || data.items || []).map((doc) => ({
      externalDocId: doc.id || doc.document_id,
      docType: doc.document_type,
      docNumber: doc.number,
      docDate: doc.date,
      status: doc.status,
      counterpartyInn: doc.sender?.inn,
      counterpartyName: doc.sender?.name,
      totalWithVat: doc.totals?.total_with_vat,
      totalWithoutVat: doc.totals?.total_without_vat,
      vatAmount: doc.totals?.vat_amount,
      items: doc.items || [],
      rawContent: JSON.stringify(doc),
    }));
  }

  async getDocument(externalId) {
    await this._ensureAuth();
    const data = await this._fetch(`/edo/v1/documents/${externalId}`);
    return {
      externalDocId: data.id || data.document_id,
      docType: data.document_type,
      docNumber: data.number,
      docDate: data.date,
      status: data.status,
      counterpartyInn: data.sender?.inn || data.buyer?.inn,
      counterpartyName: data.sender?.name || data.buyer?.name,
      totalWithVat: data.totals?.total_with_vat,
      items: data.items || [],
      rawContent: JSON.stringify(data),
    };
  }

  async signDocument(externalId) {
    await this._ensureAuth();
    await this._fetch(`/edo/v1/documents/${externalId}/sign`, {
      method: 'POST',
    });
    return { success: true };
  }

  async rejectDocument(externalId, reason) {
    await this._ensureAuth();
    await this._fetch(`/edo/v1/documents/${externalId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return { success: true };
  }

  async findCounterparty(inn) {
    await this._ensureAuth();
    const data = await this._fetch(`/edo/v1/counterparties/search?inn=${encodeURIComponent(inn)}`);
    return (data.items || data.counterparties || []).map((c) => ({
      edoId: c.id || c.edo_id,
      name: c.name,
      inn: c.inn,
      kpp: c.kpp,
    }));
  }

  async testConnection() {
    try {
      await this.authenticate();
      return { success: true, message: 'Подключение к СБИС установлено' };
    } catch (err) {
      return { success: false, message: `Ошибка подключения к СБИС: ${err.message}` };
    }
  }
}

module.exports = SbisProvider;
