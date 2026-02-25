import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

export default function ChainComparison() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [sortBy, setSortBy] = useState('revenue');
  const [sortDir, setSortDir] = useState('desc');

  const load = () => {
    setLoading(true);
    api.get(`/chain/stats/comparison?from=${from}&to=${to}`)
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [from, to]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const sorted = [...data].sort((a, b) => {
    const m = sortDir === 'asc' ? 1 : -1;
    return (a[sortBy] - b[sortBy]) * m;
  });

  const sortIcon = (col) => sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Сравнение заведений</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ color: 'var(--text-muted)' }}>—</span>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {loading && <div className="spinner" style={{ marginTop: '10vh' }} />}

      {!loading && (
        <>
          {data.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <h3 className="card-title" style={{ marginBottom: 16 }}>Выручка по заведениям</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, data.length * 50)}>
                <BarChart data={data} layout="vertical">
                  <CartesianGrid stroke="var(--border-color)" />
                  <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                    formatter={(v) => [`${Math.round(v).toLocaleString()} ₽`, 'Выручка']}
                  />
                  <Bar dataKey="revenue" fill="var(--accent)" radius={[0, 4, 4, 0]} name="Выручка" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Заведение</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('revenue')}>Выручка{sortIcon('revenue')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('cost')}>Себестоимость{sortIcon('cost')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('profit')}>Прибыль{sortIcon('profit')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('margin')}>Маржа %{sortIcon('margin')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('orders_count')}>Заказов{sortIcon('orders_count')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_check')}>Ср. чек{sortIcon('avg_check')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{Math.round(t.revenue).toLocaleString()} ₽</td>
                    <td>{Math.round(t.cost).toLocaleString()} ₽</td>
                    <td style={{ color: t.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {Math.round(t.profit).toLocaleString()} ₽
                    </td>
                    <td>{t.margin}%</td>
                    <td>{t.orders_count}</td>
                    <td>{t.avg_check.toLocaleString()} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Нет данных</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
