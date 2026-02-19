import { useEffect, useState } from 'react';
import { api } from '../api';
import { Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend
} from 'recharts';
import { exportToCsv } from '../utils/exportCsv';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function Stats() {
  const [salesData, setSalesData] = useState({ sales: [], summary: {} });
  const [productsData, setProductsData] = useState({ products: [], categories: [] });
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => { load(); }, [from, to]);

  const load = async () => {
    const [s, p] = await Promise.all([
      api.get(`/stats/sales?from=${from}&to=${to}`),
      api.get(`/stats/products?from=${from}&to=${to}`)
    ]);
    setSalesData(s);
    setProductsData(p);
  };

  const summary = salesData.summary || {};

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Статистика</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ color: 'var(--text-muted)' }}>—</span>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const headers = ['Период', 'Заказов', 'Выручка', 'Себестоимость', 'Прибыль', 'Наличные', 'Карта'];
            const rows = salesData.sales.map((s) => [s.period, s.orders_count, s.revenue, Math.round(s.cost), Math.round(s.profit), s.cash_total, s.card_total]);
            exportToCsv('sales.csv', headers, rows);
          }}><Download size={14} /> Продажи CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const headers = ['Товар', 'Кол-во', 'Выручка', 'Себестоимость', 'Прибыль'];
            const rows = productsData.products.map((p) => [p.product_name, p.total_qty, p.total_revenue, Math.round(p.total_cost), Math.round(p.total_revenue - p.total_cost)]);
            exportToCsv('products.csv', headers, rows);
          }}><Download size={14} /> Товары CSV</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Выручка</div>
          <div className="stat-value">{(summary.total_revenue || 0).toLocaleString()} ₽</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Прибыль</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{(summary.total_profit || 0).toLocaleString()} ₽</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Заказов</div>
          <div className="stat-value">{summary.total_orders || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Средний чек</div>
          <div className="stat-value">
            {summary.total_orders ? Math.round(summary.total_revenue / summary.total_orders) : 0} ₽
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Продажи по дням</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={salesData.sales}>
              <CartesianGrid stroke="var(--border-color)" />
              <XAxis dataKey="period" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
              />
              <Bar dataKey="revenue" fill="var(--accent)" name="Выручка" radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" fill="var(--success)" name="Прибыль" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>По категориям</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={productsData.categories}
                dataKey="total_revenue"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {productsData.categories.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color || COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top products */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Топ товаров</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Товар</th>
              <th>Кол-во</th>
              <th>Выручка</th>
              <th>Себестоимость</th>
              <th>Прибыль</th>
            </tr>
          </thead>
          <tbody>
            {productsData.products.map((p, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{p.product_name}</td>
                <td>{p.total_qty}</td>
                <td>{p.total_revenue} ₽</td>
                <td>{Math.round(p.total_cost)} ₽</td>
                <td style={{ color: 'var(--success)' }}>{Math.round(p.total_revenue - p.total_cost)} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
        {productsData.products.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет данных за период</div>}
      </div>
    </div>
  );
}
