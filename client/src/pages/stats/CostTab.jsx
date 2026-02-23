import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { exportToCsv } from '../../utils/exportCsv';

function marginColor(pct) {
  if (pct >= 40) return 'var(--success)';
  if (pct >= 20) return 'var(--warning)';
  return 'var(--danger)';
}

export default function CostTab({ from, to }) {
  const [data, setData] = useState({ products: [], categories: [], summary: {} });

  useEffect(() => {
    api.get(`/stats/cost-analysis?from=${from}&to=${to}`).then(setData);
  }, [from, to]);

  const { products, categories, summary } = data;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => {
          const headers = ['Товар', 'Кол-во', 'Выручка', 'Себестоимость', 'Прибыль', 'Маржа %'];
          const rows = products.map((p) => [p.product_name, p.qty, p.revenue, p.cost, p.profit, p.margin_pct]);
          exportToCsv('cost-analysis.csv', headers, rows);
        }}><Download size={14} /> CSV</button>
      </div>

      {/* Summary */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Выручка</div>
          <div className="stat-value">{(summary.total_revenue || 0).toLocaleString()} ₽</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Себестоимость</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{(summary.total_cost || 0).toLocaleString()} ₽</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Прибыль</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{(summary.total_profit || 0).toLocaleString()} ₽</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Средняя маржа</div>
          <div className="stat-value" style={{ color: marginColor(summary.avg_margin || 0) }}>{summary.avg_margin || 0}%</div>
        </div>
      </div>

      {/* Category chart */}
      {categories.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>По категориям</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categories}>
              <CartesianGrid stroke="var(--border-color)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
              />
              <Legend />
              <Bar dataKey="revenue" fill="var(--accent)" name="Выручка" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cost" fill="var(--warning)" name="Себестоимость" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Products table */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Маржинальность товаров</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Товар</th>
              <th>Кол-во</th>
              <th>Выручка</th>
              <th>Себест-ть</th>
              <th>Прибыль</th>
              <th>Маржа</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{p.product_name}</td>
                <td>{p.qty}</td>
                <td>{p.revenue.toLocaleString()} ₽</td>
                <td>{p.cost.toLocaleString()} ₽</td>
                <td style={{ color: 'var(--success)' }}>{p.profit.toLocaleString()} ₽</td>
                <td style={{ color: marginColor(p.margin_pct), fontWeight: 600 }}>{p.margin_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет данных за период</div>}
      </div>
    </>
  );
}
