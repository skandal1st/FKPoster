import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { LogIn } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

export default function ChainDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/chain/stats/dashboard')
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleEnter = async (tenantId) => {
    try {
      const res = await api.post('/chain/impersonate', { tenant_id: tenantId });
      useAuthStore.getState().setChainImpersonation(res.token, res.user, res.tenant);
      window.location.href = '/';
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) return <div className="spinner" style={{ marginTop: '20vh' }} />;
  if (!data) return null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Дашборд сети</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Выручка сегодня</div>
          <div className="stat-value">{Math.round(data.revenue).toLocaleString()} ₽</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Прибыль сегодня</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{Math.round(data.profit).toLocaleString()} ₽</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Заказов сегодня</div>
          <div className="stat-value">{data.orders_count}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Средний чек</div>
          <div className="stat-value">{data.avg_check.toLocaleString()} ₽</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 className="card-title" style={{ marginBottom: 16 }}>Выручка за 7 дней</h3>
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
              formatter={(v) => [`${Math.round(v).toLocaleString()} ₽`, 'Выручка']}
            />
            <Line type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2} name="Выручка" dot={{ fill: 'var(--accent)' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 16 }}>Заведения</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Заведение</th>
              <th>Выручка сегодня</th>
              <th>Заказов</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.per_tenant.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{Math.round(t.revenue).toLocaleString()} ₽</td>
                <td>{t.orders_count}</td>
                <td>
                  <button className="btn btn-primary btn-sm" onClick={() => handleEnter(t.id)}>
                    <LogIn size={14} /> Войти
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.per_tenant.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Нет заведений в сети
          </div>
        )}
      </div>
    </div>
  );
}
