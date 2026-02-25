import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function ChainProducts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  const load = () => {
    setLoading(true);
    api.get(`/chain/stats/products?from=${from}&to=${to}`)
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [from, to]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Товары сети</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ color: 'var(--text-muted)' }}>—</span>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {loading && <div className="spinner" style={{ marginTop: '10vh' }} />}

      {!loading && data && (
        <>
          <div className="grid-2" style={{ marginBottom: 24 }}>
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: 16 }}>По категориям</h3>
              {data.categories.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.categories}
                      dataKey="revenue"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {data.categories.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                      formatter={(v) => [`${Math.round(v).toLocaleString()} ₽`]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Нет данных</div>
              )}
            </div>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h3 className="card-title" style={{ marginBottom: 16 }}>Категории</h3>
              {data.categories.map((c, idx) => (
                <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: COLORS[idx % COLORS.length], display: 'inline-block' }} />
                    {c.name}
                  </span>
                  <span style={{ fontWeight: 600 }}>{Math.round(c.revenue).toLocaleString()} ₽</span>
                </div>
              ))}
              {data.categories.length === 0 && (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Нет данных</div>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 16 }}>Топ-20 товаров по выручке</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Товар</th>
                  <th>Категория</th>
                  <th>Кол-во</th>
                  <th>Выручка</th>
                  <th>Себестоимость</th>
                  <th>Прибыль</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>{p.product_name}</td>
                    <td>{p.category}</td>
                    <td>{p.qty}</td>
                    <td>{Math.round(p.revenue).toLocaleString()} ₽</td>
                    <td>{Math.round(p.cost).toLocaleString()} ₽</td>
                    <td style={{ color: p.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {Math.round(p.profit).toLocaleString()} ₽
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.products.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Нет данных за выбранный период</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
