import { useState, useEffect } from 'react';
import { api } from '../../api';

const TYPE_LABELS = {
  dine_in: 'В зале',
  take_away: 'С собой',
  delivery: 'Доставка',
};

const PAYMENT_LABELS = {
  cash: 'Наличные',
  card: 'Карта',
  mixed: 'Смешанная',
  delivery: 'Доставка',
};

const TYPE_COLORS = {
  dine_in: '#6366f1',
  take_away: '#22c55e',
  delivery: '#f59e0b',
};

export default function OrderTypesTab({ from, to }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/stats/order-types?from=${from}&to=${to}`).then(setData);
  }, [from, to]);

  if (!data) return <div className="spinner" />;

  const maxRevenue = Math.max(...(data.by_type.map(r => r.revenue) || [1]), 1);

  return (
    <div style={{ marginTop: 20 }}>
      {/* Summary cards */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="stat-card glass-card">
          <div className="stat-value">{data.total_orders}</div>
          <div className="stat-label">Всего заказов</div>
        </div>
        <div className="stat-card glass-card">
          <div className="stat-value">{data.total_revenue.toLocaleString('ru-RU')} ₽</div>
          <div className="stat-label">Общая выручка</div>
        </div>
        {data.by_type.map((t) => (
          <div key={t.order_type} className="stat-card glass-card">
            <div className="stat-value" style={{ color: TYPE_COLORS[t.order_type] || 'var(--accent)' }}>
              {t.orders_count}
            </div>
            <div className="stat-label">{TYPE_LABELS[t.order_type] || t.order_type}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {t.revenue.toLocaleString('ru-RU')} ₽ · Ср. чек {t.avg_check.toLocaleString('ru-RU')} ₽
            </div>
          </div>
        ))}
      </div>

      {/* Order types bar chart */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>По типу заказа</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.by_type.map((t) => {
            const pct = maxRevenue > 0 ? (t.revenue / maxRevenue) * 100 : 0;
            return (
              <div key={t.order_type} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 90, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {TYPE_LABELS[t.order_type] || t.order_type}
                </div>
                <div style={{ flex: 1, height: 28, background: 'var(--bg-tertiary)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`, borderRadius: 8,
                    background: TYPE_COLORS[t.order_type] || 'var(--accent)',
                    display: 'flex', alignItems: 'center', paddingLeft: 10,
                    transition: 'width 0.5s ease',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>
                      {t.revenue.toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                </div>
                <div style={{ width: 50, fontSize: 13, fontWeight: 600, textAlign: 'right', color: 'var(--text-secondary)' }}>
                  {t.orders_count}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment methods */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>По способу оплаты</h3>
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Способ оплаты</th>
              <th style={{ textAlign: 'right' }}>Заказов</th>
              <th style={{ textAlign: 'right' }}>Выручка</th>
            </tr>
          </thead>
          <tbody>
            {data.by_payment.map((p) => (
              <tr key={p.payment_method}>
                <td style={{ fontWeight: 600 }}>{PAYMENT_LABELS[p.payment_method] || p.payment_method}</td>
                <td style={{ textAlign: 'right' }}>{p.orders_count}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.revenue.toLocaleString('ru-RU')} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
