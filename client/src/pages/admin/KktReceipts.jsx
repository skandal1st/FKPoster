import { useState, useEffect } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Receipt, RefreshCw, RotateCcw, Search, X } from 'lucide-react';

const STATUS_LABELS = {
  pending: 'Ожидает',
  sent: 'Отправлен',
  done: 'Фискализирован',
  error: 'Ошибка',
};
const STATUS_COLORS = {
  pending: 'var(--warning)',
  sent: 'var(--info, #3b82f6)',
  done: 'var(--success)',
  error: 'var(--danger)',
};
const TYPE_LABELS = {
  sell: 'Продажа',
  sell_refund: 'Возврат',
};

export default function KktReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: '' });
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set('status', filter.status);
      const data = await api.get(`/kkt/receipts?${params.toString()}`);
      setReceipts(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const retryReceipt = async (id) => {
    try {
      const result = await api.post(`/kkt/receipts/${id}/retry`);
      if (result.success) {
        toast.success('Чек отправлен повторно');
      } else {
        toast.error(result.error || 'Ошибка повторной отправки');
      }
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const checkStatus = async (id) => {
    try {
      const result = await api.post(`/kkt/receipts/${id}/check-status`);
      if (result.success && result.status === 'done') {
        toast.success('Чек фискализирован');
      } else if (result.success) {
        toast('Статус: обрабатывается', { icon: 'ℹ' });
      } else {
        toast.error(result.error || 'Ошибка проверки');
      }
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const pollAll = async () => {
    setPolling(true);
    try {
      const result = await api.post('/kkt/poll-pending');
      const done = result.results?.filter((r) => r.status === 'done').length || 0;
      toast.success(`Проверено: ${result.count}, фискализировано: ${done}`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPolling(false);
    }
  };

  const fmt = (d) => d ? new Date(d).toLocaleString('ru') : '—';
  const fmtMoney = (v) => v != null ? parseFloat(v).toLocaleString('ru', { minimumFractionDigits: 2 }) + ' ₽' : '—';

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Чеки ККТ</h1>
        <button className="btn btn-primary" onClick={pollAll} disabled={polling}>
          <RefreshCw size={16} /> {polling ? 'Проверка...' : 'Обновить все статусы'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-input" style={{ width: 180 }} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="">Все статусы</option>
          <option value="pending">Ожидает</option>
          <option value="sent">Отправлен</option>
          <option value="done">Фискализирован</option>
          <option value="error">Ошибка</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Обновить</button>
      </div>

      {receipts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <Receipt size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p>Нет чеков</p>
          <p style={{ fontSize: 13 }}>Чеки создаются автоматически при закрытии заказов</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Заказ</th>
                <th>Тип</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>ФД</th>
                <th>Дата</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedReceipt(r)}>
                  <td>#{r.order_id}</td>
                  <td>{TYPE_LABELS[r.receipt_type] || r.receipt_type}</td>
                  <td>{fmtMoney(r.total)}</td>
                  <td>
                    <span style={{ color: STATUS_COLORS[r.status] || 'inherit', fontWeight: 600, fontSize: 13 }}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td>{r.fiscal_document || '—'}</td>
                  <td>{fmt(r.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      {r.status === 'error' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => retryReceipt(r.id)} title="Повторить">
                          <RotateCcw size={14} />
                        </button>
                      )}
                      {r.status === 'sent' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => checkStatus(r.id)} title="Проверить статус">
                          <Search size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedReceipt && (
        <div className="modal-overlay" onClick={() => setSelectedReceipt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3>Чек #{selectedReceipt.id} — Заказ #{selectedReceipt.order_id}</h3>
              <button className="btn-icon" onClick={() => setSelectedReceipt(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14, marginBottom: 16 }}>
                <div><strong>Тип:</strong> {TYPE_LABELS[selectedReceipt.receipt_type] || selectedReceipt.receipt_type}</div>
                <div><strong>Статус:</strong> <span style={{ color: STATUS_COLORS[selectedReceipt.status] }}>{STATUS_LABELS[selectedReceipt.status] || selectedReceipt.status}</span></div>
                <div><strong>Сумма:</strong> {fmtMoney(selectedReceipt.total)}</div>
                <div><strong>Оплата:</strong> {selectedReceipt.payment_method === 'cash' ? 'Наличные' : selectedReceipt.payment_method === 'card' ? 'Карта' : 'Смешанная'}</div>
                <div><strong>Провайдер:</strong> {selectedReceipt.kkt_provider === 'atol' ? 'АТОЛ Онлайн' : selectedReceipt.kkt_provider || '—'}</div>
                <div><strong>UUID:</strong> {selectedReceipt.external_uuid || '—'}</div>
                {selectedReceipt.fiscal_number && <div><strong>ФН:</strong> {selectedReceipt.fiscal_number}</div>}
                {selectedReceipt.fiscal_document && <div><strong>ФД:</strong> {selectedReceipt.fiscal_document}</div>}
                {selectedReceipt.fiscal_sign && <div><strong>ФПД:</strong> {selectedReceipt.fiscal_sign}</div>}
                {selectedReceipt.fn_number && <div><strong>Номер ФН:</strong> {selectedReceipt.fn_number}</div>}
                {selectedReceipt.registration_number && <div><strong>РН ККТ:</strong> {selectedReceipt.registration_number}</div>}
                {selectedReceipt.receipt_datetime && <div><strong>Дата фискализации:</strong> {fmt(selectedReceipt.receipt_datetime)}</div>}
                <div><strong>Попыток:</strong> {selectedReceipt.retry_count || 0}</div>
                <div><strong>Создан:</strong> {fmt(selectedReceipt.created_at)}</div>
              </div>

              {selectedReceipt.error_message && (
                <div style={{ padding: '8px 12px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>
                  <strong>Ошибка:</strong> {selectedReceipt.error_message}
                </div>
              )}

              {selectedReceipt.request_payload && (
                <details style={{ marginBottom: 12 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>Тело запроса (JSON)</summary>
                  <pre style={{ fontSize: 11, background: 'var(--bg-elevated)', padding: 12, borderRadius: 4, overflow: 'auto', maxHeight: 200, marginTop: 8 }}>
                    {JSON.stringify(typeof selectedReceipt.request_payload === 'string' ? JSON.parse(selectedReceipt.request_payload) : selectedReceipt.request_payload, null, 2)}
                  </pre>
                </details>
              )}

              {selectedReceipt.response_payload && (
                <details>
                  <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>Ответ АТОЛ (JSON)</summary>
                  <pre style={{ fontSize: 11, background: 'var(--bg-elevated)', padding: 12, borderRadius: 4, overflow: 'auto', maxHeight: 200, marginTop: 8 }}>
                    {JSON.stringify(typeof selectedReceipt.response_payload === 'string' ? JSON.parse(selectedReceipt.response_payload) : selectedReceipt.response_payload, null, 2)}
                  </pre>
                </details>
              )}
            </div>
            <div className="modal-footer">
              {selectedReceipt.status === 'error' && (
                <button className="btn btn-primary" onClick={() => { retryReceipt(selectedReceipt.id); setSelectedReceipt(null); }}>
                  <RotateCcw size={14} /> Повторить
                </button>
              )}
              {selectedReceipt.status === 'sent' && (
                <button className="btn btn-primary" onClick={() => { checkStatus(selectedReceipt.id); setSelectedReceipt(null); }}>
                  <Search size={14} /> Проверить статус
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setSelectedReceipt(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
