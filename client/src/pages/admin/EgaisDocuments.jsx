import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { RefreshCw, Check, X, ArrowDown, ArrowUp, FileText } from 'lucide-react';

const TABS = [
  { key: 'incoming', label: 'Входящие ТТН' },
  { key: 'reg1', label: 'Регистр 1' },
  { key: 'reg2', label: 'Регистр 2' },
  { key: 'all', label: 'Все документы' },
];

const STATUS_LABELS = {
  draft: 'Черновик',
  sending: 'Отправка...',
  sent: 'Отправлен',
  received: 'Получен',
  accepted: 'Принят',
  rejected: 'Отклонён',
  error: 'Ошибка',
};

const STATUS_COLORS = {
  draft: 'var(--text-muted)',
  sending: 'var(--warning)',
  sent: 'var(--accent)',
  received: 'var(--accent)',
  accepted: 'var(--success)',
  rejected: 'var(--danger)',
  error: 'var(--danger)',
};

export default function EgaisDocuments() {
  const [tab, setTab] = useState('incoming');
  const [documents, setDocuments] = useState([]);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);

  useEffect(() => { loadTab(); }, [tab]);

  const loadTab = async () => {
    setLoading(true);
    try {
      if (tab === 'reg1' || tab === 'reg2') {
        const data = await api.get(`/egais/stock/${tab}`);
        setStock(data);
      } else if (tab === 'incoming') {
        const data = await api.get('/egais/documents?doc_type=WayBill&direction=incoming');
        setDocuments(data);
      } else {
        const data = await api.get('/egais/documents');
        setDocuments(data);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptTTN = async (doc) => {
    try {
      const summary = doc.summary || {};
      const wayBillId = summary.number || doc.external_id;
      if (!wayBillId) {
        toast.error('Не удалось определить номер ТТН');
        return;
      }
      const result = await api.post(`/egais/ttn/${wayBillId}/accept`, { note: '' });
      if (result.success) {
        toast.success('ТТН подтверждена');
        loadTab();
      } else {
        toast.error(result.error || 'Ошибка подтверждения');
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRejectTTN = async (doc) => {
    const note = prompt('Причина отклонения:');
    if (note === null) return;
    try {
      const summary = doc.summary || {};
      const wayBillId = summary.number || doc.external_id;
      const result = await api.post(`/egais/ttn/${wayBillId}/reject`, { note });
      if (result.success) {
        toast.success('ТТН отклонена');
        loadTab();
      } else {
        toast.error(result.error || 'Ошибка отклонения');
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleQueryStock = async (registerType) => {
    try {
      const result = await api.post('/egais/query-stock', { register_type: registerType });
      if (result.success) {
        toast.success('Запрос остатков отправлен');
      } else {
        toast.error(result.error || 'Ошибка запроса');
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">ЕГАИС</h1>
        <button className="btn btn-ghost" onClick={loadTab} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Обновить
        </button>
      </div>

      {/* Табы */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border-color)' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn btn-ghost btn-sm ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
            style={{
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              borderRadius: 0,
              fontWeight: tab === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Контент по табу */}
      {(tab === 'reg1' || tab === 'reg2') && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {tab === 'reg1' ? 'Регистр 1 — склад' : 'Регистр 2 — торговый зал'}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => handleQueryStock(tab)}>
              Запросить остатки
            </button>
          </div>

          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Алкокод</th>
                  <th>Наименование</th>
                  <th>Остаток</th>
                  <th>Обновлено</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.egais_alcocode}</td>
                    <td>{s.product_name || '—'}</td>
                    <td>{s.quantity}</td>
                    <td>{s.last_synced_at ? new Date(s.last_synced_at).toLocaleString('ru') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stock.length === 0 && (
              <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>
                Нет данных. Отправьте запрос остатков.
              </div>
            )}
          </div>
        </div>
      )}

      {(tab === 'incoming' || tab === 'all') && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Тип</th>
                <th>Статус</th>
                <th>Дата</th>
                <th>Детали</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const summary = typeof doc.summary === 'string' ? JSON.parse(doc.summary) : (doc.summary || {});
                return (
                  <tr key={doc.id}>
                    <td>
                      {doc.direction === 'incoming'
                        ? <ArrowDown size={14} style={{ color: 'var(--accent)' }} />
                        : <ArrowUp size={14} style={{ color: 'var(--text-muted)' }} />
                      }
                    </td>
                    <td>{doc.doc_type}</td>
                    <td>
                      <span style={{ color: STATUS_COLORS[doc.status] || 'inherit', fontWeight: 500 }}>
                        {STATUS_LABELS[doc.status] || doc.status}
                      </span>
                      {doc.error_message && (
                        <div style={{ fontSize: 11, color: 'var(--danger)' }}>{doc.error_message}</div>
                      )}
                    </td>
                    <td>{new Date(doc.created_at).toLocaleString('ru')}</td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {summary.shipper?.name || summary.wayBillId || summary.action || '—'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {tab === 'incoming' && doc.doc_type === 'WayBill' && doc.status === 'received' && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleAcceptTTN(doc)} style={{ color: 'var(--success)' }}>
                            <Check size={14} /> Принять
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleRejectTTN(doc)} style={{ color: 'var(--danger)' }}>
                            <X size={14} /> Отклонить
                          </button>
                        </>
                      )}
                      <button className="btn-icon" onClick={() => setSelectedDoc(doc)} title="Подробнее">
                        <FileText size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {documents.length === 0 && (
            <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет документов</div>
          )}
        </div>
      )}

      {/* Модал деталей документа */}
      {selectedDoc && (
        <div className="modal-overlay" onClick={() => setSelectedDoc(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3 className="modal-title">{selectedDoc.doc_type} #{selectedDoc.id}</h3>
              <button className="btn-icon" onClick={() => setSelectedDoc(null)}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 13 }}>
              <div style={{ marginBottom: 8 }}>
                <strong>Статус:</strong>{' '}
                <span style={{ color: STATUS_COLORS[selectedDoc.status] }}>
                  {STATUS_LABELS[selectedDoc.status] || selectedDoc.status}
                </span>
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>Направление:</strong> {selectedDoc.direction === 'incoming' ? 'Входящий' : 'Исходящий'}
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>Дата:</strong> {new Date(selectedDoc.created_at).toLocaleString('ru')}
              </div>
              {selectedDoc.error_message && (
                <div style={{ marginBottom: 8, color: 'var(--danger)' }}>
                  <strong>Ошибка:</strong> {selectedDoc.error_message}
                </div>
              )}
              <div style={{ marginBottom: 8 }}>
                <strong>Данные:</strong>
                <pre style={{
                  background: 'var(--bg-tertiary)', padding: 12, borderRadius: 4,
                  fontSize: 11, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap',
                }}>
                  {JSON.stringify(selectedDoc.summary, null, 2)}
                </pre>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setSelectedDoc(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
