import { useEffect, useState } from 'react';
import { api } from '../api';
import { AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/stats/dashboard').then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="spinner" style={{ marginTop: '20vh' }} />;
  if (!data) return null;

  const changeIcon = data.revenue_change >= 0
    ? <TrendingUp size={14} style={{ marginRight: 4 }} />
    : <TrendingDown size={14} style={{ marginRight: 4 }} />;
  const changeColor = data.revenue_change >= 0 ? 'var(--success)' : 'var(--danger)';

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Дашборд</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {new Date().toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {/* KPI cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Выручка сегодня</div>
          <div className="stat-value">{data.revenue.toLocaleString()} ₽</div>
          {data.revenue_change !== 0 && (
            <div style={{ fontSize: 12, color: changeColor, marginTop: 4, display: 'flex', alignItems: 'center' }}>
              {changeIcon} {data.revenue_change > 0 ? '+' : ''}{data.revenue_change}% vs неделю назад
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-label">Прибыль сегодня</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{Math.round(data.profit).toLocaleString()} ₽</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Открытые заказы</div>
          <div className="stat-value">{data.open_orders}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Стоимость запасов</div>
          <div className="stat-value">{Math.round(data.stock_value).toLocaleString()} ₽</div>
          {data.low_stock_count > 0 && (
            <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4, display: 'flex', alignItems: 'center' }}>
              <AlertTriangle size={12} style={{ marginRight: 4 }} /> {data.low_stock_count} товаров с низким остатком
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Выручка за 7 дней</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.trend}>
              <CartesianGrid stroke="var(--border-color)" />
              <XAxis
                dataKey="day"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickFormatter={(v) => new Date(v).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
              />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
                labelFormatter={(v) => new Date(v).toLocaleDateString('ru')}
              />
              <Line type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2} name="Выручка" dot={{ fill: 'var(--accent)' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Продажи по категориям сегодня</h3>
          {data.category_sales.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data.category_sales}
                  dataKey="revenue"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {data.category_sales.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color || COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Нет продаж сегодня</div>
          )}
        </div>
      </div>

      {/* Top products */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Топ-5 товаров сегодня</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Товар</th>
              <th>Кол-во</th>
              <th>Выручка</th>
            </tr>
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
        {data.top_products.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет продаж сегодня</div>}
      </div>
    </div>
  );
}
