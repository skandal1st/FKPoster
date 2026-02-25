import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

export default function ChainSales() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [group, setGroup] = useState('day');

  const load = () => {
    setLoading(true);
    api.get(`/chain/stats/sales?from=${from}&to=${to}&group=${group}`)
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [from, to, group]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Продажи</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ color: 'var(--text-muted)' }}>—</span>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} />
          <select className="form-input" style={{ width: 'auto' }} value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="day">По дням</option>
            <option value="month">По месяцам</option>
          </select>
        </div>
      </div>

      {loading && <div className="spinner" style={{ marginTop: '10vh' }} />}

      {!loading && data && (
        <>
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-label">Выручка</div>
              <div className="stat-value">{Math.round(data.revenue).toLocaleString()} ₽</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Себестоимость</div>
              <div className="stat-value">{Math.round(data.cost).toLocaleString()} ₽</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Прибыль</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{Math.round(data.profit).toLocaleString()} ₽</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Заказов</div>
              <div className="stat-value">{data.orders_count}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <h3 className="card-title" style={{ marginBottom: 16 }}>Выручка по {group === 'day' ? 'дням' : 'месяцам'}</h3>
            {data.sales.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.sales}>
                  <CartesianGrid stroke="var(--border-color)" />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return group === 'month'
                        ? d.toLocaleDateString('ru', { month: 'short', year: '2-digit' })
                        : d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
                    }}
                  />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                    labelFormatter={(v) => new Date(v).toLocaleDateString('ru')}
                    formatter={(v) => [`${Math.round(v).toLocaleString()} ₽`, 'Выручка']}
                  />
                  <Bar dataKey="revenue" fill="var(--accent)" radius={[4, 4, 0, 0]} name="Выручка" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Нет данных</div>
            )}
          </div>

          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 16 }}>По заведениям</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Заведение</th>
                  <th>Выручка</th>
                  <th>Заказов</th>
                </tr>
              </thead>
              <tbody>
                {data.per_tenant.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{Math.round(t.revenue).toLocaleString()} ₽</td>
                    <td>{t.orders_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.per_tenant.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Нет данных</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
