import { useEffect, useState } from 'react';
import { api } from '../api';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function ShiftReportModal({ shiftId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  /** Для смешанной оплаты: { orderId, total, cashAmount } */
  const [mixedEdit, setMixedEdit] = useState(null);

  const fetchShift = () => {
    return api.get(`/stats/shift/${shiftId}`).then((d) => {
      setData(d);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchShift();
  }, [shiftId]);

  const handlePaymentMethodChange = async (orderId, newMethod, orderTotal, paidCash, paidCard) => {
    if (newMethod === 'mixed' && paidCash == null) {
      // Открыть мини-форму для ввода суммы наличных
      setMixedEdit({ orderId, total: parseFloat(orderTotal) || 0, cashAmount: '' });
      return;
    }
    if (updatingId) return;
    setUpdatingId(orderId);
    try {
      const body = { payment_method: newMethod };
      if (newMethod === 'mixed') {
        body.paid_cash = paidCash;
        body.paid_card = paidCard;
      }
      await api.patch(`/orders/${orderId}/payment-method`, body);
      await fetchShift();
      toast.success('Способ оплаты изменён');
    } catch (err) {
      toast.error(err.message || 'Не удалось изменить способ оплаты');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleMixedEditConfirm = () => {
    if (!mixedEdit) return;
    const cash = parseFloat(mixedEdit.cashAmount);
    if (isNaN(cash) || cash < 0 || cash > mixedEdit.total) {
      toast.error('Введите корректную сумму наличных');
      return;
    }
    const card = Math.round((mixedEdit.total - cash) * 100) / 100;
    const { orderId, total } = mixedEdit;
    setMixedEdit(null);
    handlePaymentMethodChange(orderId, 'mixed', total, cash, card);
  };

  if (loading) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800 }}>
        <div className="spinner" />
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            Отчёт по смене #{data.shift.id} — {new Date(data.shift.opened_at).toLocaleDateString('ru')}
          </h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* KPI cards */}
        <div className="grid-4" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Выручка</div>
            <div className="stat-value">{data.revenue.toLocaleString()} ₽</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Прибыль</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>{Math.round(data.profit).toLocaleString()} ₽</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Заказов</div>
            <div className="stat-value">{data.orders_count}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Средний чек</div>
            <div className="stat-value">{data.avg_check} ₽</div>
          </div>
        </div>

        {/* Hourly chart */}
        {data.hourly.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ marginBottom: 12 }}>Продажи по часам</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.hourly}>
                <CartesianGrid stroke="var(--border-color)" />
                <XAxis dataKey="hour" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                />
                <Bar dataKey="revenue" fill="var(--accent)" name="Выручка" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top products */}
        {data.top_products.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ marginBottom: 12 }}>Топ-5 товаров</h4>
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Товар</th><th>Кол-во</th><th>Выручка</th></tr>
              </thead>
              <tbody>
                {data.top_products.map((p, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>{p.product_name}</td>
                    <td>{p.qty}</td>
                    <td>{p.revenue} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Workshop totals */}
        {data.workshop_totals && data.workshop_totals.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ marginBottom: 12 }}>По цехам</h4>
            <table className="data-table">
              <thead>
                <tr><th>Цех</th><th>Выручка</th><th>Наличные</th><th>Карта</th></tr>
              </thead>
              <tbody>
                {data.workshop_totals.map((wt, idx) => (
                  <tr key={wt.id || `no-ws-${idx}`}>
                    <td>{wt.name || 'Без цеха'}</td>
                    <td>{wt.revenue.toLocaleString()} ₽</td>
                    <td>{wt.cash.toLocaleString()} ₽</td>
                    <td>{wt.card.toLocaleString()} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Orders list */}
        <h4 style={{ marginBottom: 12 }}>Заказы</h4>
        <table className="data-table">
          <thead>
            <tr><th>Время</th><th>Стол</th><th>Сумма</th><th>Оплата</th><th>Кассир</th></tr>
          </thead>
          <tbody>
            {data.orders.map((o) => (
              <tr key={o.id}>
                <td>{o.closed_at ? new Date(o.closed_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td>{o.table_label || (o.table_number ? `Стол ${o.table_number}` : '—')}</td>
                <td>{o.total} ₽</td>
                <td>
                  <select
                    className="form-input payment-method-select"
                    value={o.payment_method || 'cash'}
                    onChange={(e) => handlePaymentMethodChange(o.id, e.target.value, o.total)}
                    disabled={!!updatingId}
                    title="Изменить способ оплаты"
                  >
                    <option value="cash">Наличные</option>
                    <option value="card">Карта</option>
                    <option value="mixed">Смешанная</option>
                  </select>
                  {o.payment_method === 'mixed' && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Нал: {Number(o.paid_cash || 0).toLocaleString()} ₽ / Карта: {Number(o.paid_card || 0).toLocaleString()} ₽
                    </div>
                  )}
                </td>
                <td>{o.cashier_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.orders.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет заказов</div>}
        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          Способ оплаты можно изменить в колонке «Оплата» — пересчитаются итоги смены по наличным и карте.
        </p>
      </div>

      {/* Мини-модал ввода суммы наличных для смешанной оплаты */}
      {mixedEdit && (
        <div className="modal-overlay" onClick={() => setMixedEdit(null)} style={{ zIndex: 1100 }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-header">
              <h3 className="modal-title">Смешанная оплата</h3>
              <button className="btn-icon" onClick={() => setMixedEdit(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}>Сумма заказа: <strong>{mixedEdit.total} ₽</strong></p>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Сумма наличными:</label>
                <input
                  type="number"
                  className="form-input"
                  value={mixedEdit.cashAmount}
                  onChange={(e) => setMixedEdit({ ...mixedEdit, cashAmount: e.target.value })}
                  placeholder="0"
                  min="0"
                  max={mixedEdit.total}
                  style={{ width: '100%', fontSize: 16 }}
                  autoFocus
                />
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                Картой: <strong>{Math.max(0, Math.round((mixedEdit.total - (parseFloat(mixedEdit.cashAmount) || 0)) * 100) / 100)} ₽</strong>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setMixedEdit(null)}>Отмена</button>
              <button className="btn btn-warning" onClick={handleMixedEditConfirm}>Применить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
