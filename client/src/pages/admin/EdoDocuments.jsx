import { useState, useEffect } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FileText, Download, Check, X, Link, RefreshCw } from 'lucide-react';

const DOC_TYPE_LABELS = { upd: 'УПД', invoice: 'Счёт-фактура', act_writeoff: 'Акт списания', unknown: 'Прочее' };
const STATUS_LABELS = {
  draft: 'Черновик', sending: 'Отправка...', sent: 'Отправлен',
  received: 'Получен', accepted: 'Принят', rejected: 'Отклонён', error: 'Ошибка',
};
const STATUS_COLORS = {
  draft: 'var(--text-muted)', sending: 'var(--warning)', sent: 'var(--accent)',
  received: 'var(--info, #3b82f6)', accepted: 'var(--success)', rejected: 'var(--danger)', error: 'var(--danger)',
};

export default function EdoDocuments() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [filter, setFilter] = useState({ direction: '', status: '', doc_type: '' });
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [linkEgaisId, setLinkEgaisId] = useState('');

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.direction) params.set('direction', filter.direction);
      if (filter.status) params.set('status', filter.status);
      if (filter.doc_type) params.set('doc_type', filter.doc_type);
      const data = await api.get(`/edo/documents?${params.toString()}`);
      setDocs(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchIncoming = async () => {
    setFetching(true);
    try {
      const result = await api.post('/edo/documents/fetch');
      toast.success(`Загружено документов: ${result.fetched}${result.matched?.length ? `, сопоставлено с ЕГАИС: ${result.matched.length}` : ''}`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setFetching(false);
    }
  };

  const acceptDoc = async (id) => {
    try {
      await api.post(`/edo/documents/${id}/accept`);
      toast.success('Документ принят');
      load();
      setSelectedDoc(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const rejectDoc = async (id) => {
    const reason = prompt('Причина отклонения:');
    if (reason === null) return;
    try {
      await api.post(`/edo/documents/${id}/reject`, { reason });
      toast.success('Документ отклонён');
      load();
      setSelectedDoc(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const linkEgais = async (id) => {
    if (!linkEgaisId) return;
    try {
      await api.post(`/edo/documents/${id}/link-egais`, { egais_document_id: Number(linkEgaisId) });
      toast.success('Документ связан с ЕГАИС');
      setLinkEgaisId('');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('ru') : '—';
  const fmtMoney = (v) => v != null ? parseFloat(v).toLocaleString('ru', { minimumFractionDigits: 2 }) + ' ₽' : '—';

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">ЭДО документы</h1>
        <button className="btn btn-primary" onClick={fetchIncoming} disabled={fetching}>
          <Download size={16} /> {fetching ? 'Загрузка...' : 'Загрузить входящие'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-input" style={{ width: 160 }} value={filter.direction} onChange={(e) => setFilter({ ...filter, direction: e.target.value })}>
          <option value="">Все направления</option>
          <option value="incoming">Входящие</option>
          <option value="outgoing">Исходящие</option>
        </select>
        <select className="form-input" style={{ width: 160 }} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="">Все статусы</option>
          <option value="received">Получен</option>
          <option value="accepted">Принят</option>
          <option value="rejected">Отклонён</option>
          <option value="sent">Отправлен</option>
          <option value="error">Ошибка</option>
        </select>
        <select className="form-input" style={{ width: 160 }} value={filter.doc_type} onChange={(e) => setFilter({ ...filter, doc_type: e.target.value })}>
          <option value="">Все типы</option>
          <option value="upd">УПД</option>
          <option value="invoice">Счёт-фактура</option>
          <option value="act_writeoff">Акт списания</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Обновить</button>
      </div>

      {docs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <FileText size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p>Нет документов</p>
          <p style={{ fontSize: 13 }}>Нажмите «Загрузить входящие» для получения документов из ЭДО</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Тип</th>
                <th>Номер</th>
                <th>Дата</th>
                <th>Направление</th>
                <th>Контрагент</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>ЕГАИС</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedDoc(doc)}>
                  <td>{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</td>
                  <td>{doc.doc_number || '—'}</td>
                  <td>{fmt(doc.doc_date)}</td>
                  <td>{doc.direction === 'incoming' ? 'Вх.' : 'Исх.'}</td>
                  <td>{doc.counterparty_name || doc.counterparty_inn || '—'}</td>
                  <td>{fmtMoney(doc.total_with_vat)}</td>
                  <td>
                    <span style={{ color: STATUS_COLORS[doc.status] || 'inherit', fontWeight: 600, fontSize: 13 }}>
                      {STATUS_LABELS[doc.status] || doc.status}
                    </span>
                  </td>
                  <td>{doc.egais_document_id ? <Link size={14} style={{ color: 'var(--success)' }} /> : '—'}</td>
                  <td>
                    {doc.direction === 'incoming' && doc.status === 'received' && (
                      <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" onClick={() => acceptDoc(doc.id)} title="Принять">
                          <Check size={14} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => rejectDoc(doc.id)} title="Отклонить">
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedDoc && (
        <div className="modal-overlay" onClick={() => setSelectedDoc(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3>{DOC_TYPE_LABELS[selectedDoc.doc_type] || selectedDoc.doc_type} {selectedDoc.doc_number || ''}</h3>
              <button className="btn-icon" onClick={() => setSelectedDoc(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14, marginBottom: 16 }}>
                <div><strong>Дата:</strong> {fmt(selectedDoc.doc_date)}</div>
                <div><strong>Статус:</strong> <span style={{ color: STATUS_COLORS[selectedDoc.status] }}>{STATUS_LABELS[selectedDoc.status] || selectedDoc.status}</span></div>
                <div><strong>Направление:</strong> {selectedDoc.direction === 'incoming' ? 'Входящий' : 'Исходящий'}</div>
                <div><strong>Провайдер:</strong> {selectedDoc.edo_provider === 'sbis' ? 'СБИС' : selectedDoc.edo_provider === 'diadoc' ? 'Диадок' : '—'}</div>
                <div><strong>Контрагент:</strong> {selectedDoc.counterparty_name || '—'}</div>
                <div><strong>ИНН:</strong> {selectedDoc.counterparty_inn || '—'}</div>
                <div><strong>Без НДС:</strong> {fmtMoney(selectedDoc.total_without_vat)}</div>
                <div><strong>НДС:</strong> {fmtMoney(selectedDoc.vat_amount)}</div>
                <div><strong>Итого:</strong> {fmtMoney(selectedDoc.total_with_vat)}</div>
                <div><strong>ЕГАИС:</strong> {selectedDoc.egais_document_id ? `Документ #${selectedDoc.egais_document_id}` : 'Не связан'}</div>
              </div>

              {selectedDoc.error_message && (
                <div style={{ padding: '8px 12px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>
                  {selectedDoc.error_message}
                </div>
              )}

              {selectedDoc.items && Array.isArray(selectedDoc.items) && selectedDoc.items.length > 0 && (
                <>
                  <h4 style={{ marginBottom: 8 }}>Позиции</h4>
                  <div className="table-container">
                    <table className="table">
                      <thead><tr><th>#</th><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
                      <tbody>
                        {(typeof selectedDoc.items === 'string' ? JSON.parse(selectedDoc.items) : selectedDoc.items).map((item, i) => (
                          <tr key={i}>
                            <td>{item.line_number || i + 1}</td>
                            <td>{item.name}</td>
                            <td>{item.quantity}</td>
                            <td>{fmtMoney(item.price)}</td>
                            <td>{fmtMoney(item.total || item.total_without_vat)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {!selectedDoc.egais_document_id && (
                <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="form-label">Связать с ЕГАИС документом (ID)</label>
                    <input className="form-input" value={linkEgaisId} onChange={(e) => setLinkEgaisId(e.target.value)} placeholder="ID документа ЕГАИС" />
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => linkEgais(selectedDoc.id)} disabled={!linkEgaisId}>
                    <Link size={14} /> Связать
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {selectedDoc.direction === 'incoming' && selectedDoc.status === 'received' && (
                <>
                  <button className="btn btn-primary" onClick={() => acceptDoc(selectedDoc.id)}><Check size={14} /> Принять</button>
                  <button className="btn btn-danger" onClick={() => rejectDoc(selectedDoc.id)}><X size={14} /> Отклонить</button>
                </>
              )}
              <button className="btn btn-ghost" onClick={() => setSelectedDoc(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
