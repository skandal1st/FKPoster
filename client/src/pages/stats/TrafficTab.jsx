import { useEffect, useState } from 'react';
import { api } from '../../api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

const DAY_NAMES = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function TrafficTab({ from, to }) {
  const [data, setData] = useState({ hourly: [], daily: [], peak_hour: null, peak_day: null, total_orders: 0, avg_check: 0, avg_orders_per_day: 0 });

  useEffect(() => {
    api.get(`/stats/traffic?from=${from}&to=${to}`).then(setData);
  }, [from, to]);

  const { hourly, daily, peak_hour, peak_day, total_orders, avg_check, avg_orders_per_day } = data;

  const hourlyFormatted = hourly.map(h => ({ ...h, label: `${String(h.hour).padStart(2, '0')}:00` }));
  const dailyFormatted = daily.map(d => ({ ...d, label: DAY_NAMES[d.day_of_week] || d.day_of_week }));

  return (
    <>
      {/* Summary */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Заказов всего</div>
          <div className="stat-value">{total_orders}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Средний чек</div>
          <div className="stat-value">{avg_check.toLocaleString()} ₽</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Пиковый час</div>
          <div className="stat-value">{peak_hour !== null ? `${String(peak_hour).padStart(2, '0')}:00` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Лучший день</div>
          <div className="stat-value">{peak_day !== null ? DAY_NAMES[peak_day] : '—'}</div>
        </div>
      </div>

      {/* Hourly chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 4 }}>Заказы по часам</h3>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Среднее: {avg_orders_per_day} заказов/день</div>
        {hourlyFormatted.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourlyFormatted}>
              <CartesianGrid stroke="var(--border-color)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
                formatter={(value, name) => {
                  if (name === 'orders_count') return [value, 'Заказов'];
                  return [value.toLocaleString() + ' ₽', 'Выручка'];
                }}
              />
              <Bar dataKey="orders_count" fill="var(--accent)" name="orders_count" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет данных за период</div>
        )}
      </div>

      {/* Daily chart */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>По дням недели</h3>
        {dailyFormatted.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyFormatted}>
              <CartesianGrid stroke="var(--border-color)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
                formatter={(value, name) => {
                  if (name === 'orders_count') return [value, 'Заказов'];
                  return [value.toLocaleString() + ' ₽', 'Ср. чек'];
                }}
              />
              <Bar dataKey="orders_count" fill="var(--accent)" name="orders_count" radius={[4, 4, 0, 0]} />
              <Bar dataKey="avg_check" fill="var(--success)" name="avg_check" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет данных за период</div>
        )}
      </div>
    </>
  );
}
