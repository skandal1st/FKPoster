import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Download } from 'lucide-react';
import { exportToCsv } from '../../utils/exportCsv';

export default function DiscountsTab({ from, to }) {
  const [data, setData] = useState({ summary: {}, by_guest: [] });

  useEffect(() => {
    api.get(`/stats/discounts?from=${from}&to=${to}`).then(setData);
  }, [from, to]);

  const { summary, by_guest } = data;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => {
          const headers = ['Гость', 'Тип скидки', 'Размер', 'Заказов', 'Сумма скидок', 'Оплачено'];
          const rows = by_guest.map((g) => [
            g.name,
            g.discount_type === 'percent' ? 'Процент' : 'Фиксированная',
            g.discount_type === 'percent' ? g.discount_value + '%' : g.discount_value + ' ₽',
            g.orders_count,
            g.total_discount,
            g.total_paid
          ]);
          exportToCsv('discounts.csv', headers, rows);
        }}><Download size={14} /> CSV</button>
      </div>

      {/* Summary */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Всего заказов</div>
          <div className="stat-value">{summary.total_orders || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Со скидкой</div>
          <div className="stat-value">{summary.discounted_orders || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Сумма скидок</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{(summary.total_discount || 0).toLocaleString()} ₽</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">% от выручки</div>
          <div className="stat-value">{summary.discount_pct || 0}%</div>
        </div>
      </div>

      {/* By guest table */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Скидки по гостям</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Гость</th>
              <th>Тип скидки</th>
              <th>Размер</th>
              <th>Заказов</th>
              <th>Сумма скидок</th>
              <th>Оплачено</th>
            </tr>
          </thead>
          <tbody>
            {by_guest.map((g, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{g.name}</td>
                <td>{g.discount_type === 'percent' ? 'Процент' : 'Фиксированная'}</td>
                <td>{g.discount_type === 'percent' ? `${g.discount_value}%` : `${g.discount_value} ₽`}</td>
                <td>{g.orders_count}</td>
                <td style={{ color: 'var(--warning)' }}>{g.total_discount.toLocaleString()} ₽</td>
                <td>{g.total_paid.toLocaleString()} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
        {by_guest.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет данных за период</div>}
      </div>
    </>
  );
}
