import { useEffect, useState } from 'react';
import { api } from '../api';
import { X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function ShiftReportModal({ shiftId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/stats/shift/${shiftId}`).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [shiftId]);

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
                <td>{o.table_number ? `Стол ${o.table_number}` : '—'}</td>
                <td>{o.total} ₽</td>
                <td>{o.payment_method === 'cash' ? 'Наличные' : 'Карта'}</td>
                <td>{o.cashier_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.orders.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет заказов</div>}
      </div>
    </div>
  );
}
