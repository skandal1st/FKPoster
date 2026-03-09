import { useEffect, useState } from 'react';
import { api } from '../../api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { exportToCsv } from '../../utils/exportCsv';

const DAY_NAMES = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function formatMinutes(m) {
  if (m == null) return '—';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}ч ${min}м`;
  return `${min}м`;
}

export default function TableTimeTab({ from, to }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/stats/table-time?from=${from}&to=${to}`).then(setData);
  }, [from, to]);

  if (!data) return <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Загрузка...</div>;

  const { summary, by_table, by_hall, by_hour, by_day_of_week } = data;

  const hourlyFormatted = by_hour.map(h => ({ ...h, label: `${String(h.hour).padStart(2, '0')}:00` }));
  const dailyFormatted = by_day_of_week.map(d => ({ ...d, label: DAY_NAMES[d.day_of_week] || d.day_of_week }));

  const handleExport = () => {
    const headers = ['Столик', 'Зал', 'Заказов', 'Ср. время (мин)', 'Выручка'];
    const rows = by_table.map(t => [
      t.label || t.number,
      t.hall_name,
      t.orders_count,
      t.avg_minutes,
      t.revenue.toFixed(0),
    ]);
    exportToCsv('table-time.csv', headers, rows);
  };

  return (
    <>
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Заказов за столиками</div>
          <div className="stat-value">{summary.total_orders}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Среднее время</div>
          <div className="stat-value">{formatMinutes(summary.avg_minutes)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Мин. время</div>
          <div className="stat-value">{formatMinutes(summary.min_minutes)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Макс. время</div>
          <div className="stat-value">{formatMinutes(summary.max_minutes)}</div>
        </div>
      </div>

      {/* Hourly chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Среднее время по часам</h3>
        {hourlyFormatted.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourlyFormatted}>
              <CartesianGrid stroke="var(--border-color)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} unit="м" />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
                formatter={(value, name) => {
                  if (name === 'avg_minutes') return [formatMinutes(value), 'Ср. время'];
                  return [value, 'Заказов'];
                }}
              />
              <Bar dataKey="avg_minutes" fill="var(--warning)" name="avg_minutes" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет данных за период</div>
        )}
      </div>

      {/* Daily chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Среднее время по дням недели</h3>
        {dailyFormatted.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyFormatted}>
              <CartesianGrid stroke="var(--border-color)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} unit="м" />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
                formatter={(value, name) => {
                  if (name === 'avg_minutes') return [formatMinutes(value), 'Ср. время'];
                  return [value, 'Заказов'];
                }}
              />
              <Bar dataKey="avg_minutes" fill="var(--warning)" name="avg_minutes" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет данных за период</div>
        )}
      </div>

      {/* By hall table */}
      {by_hall.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>По залам</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Зал</th>
                  <th>Заказов</th>
                  <th>Ср. время</th>
                  <th>Выручка</th>
                </tr>
              </thead>
              <tbody>
                {by_hall.map(h => (
                  <tr key={h.id}>
                    <td>{h.name}</td>
                    <td>{h.orders_count}</td>
                    <td>{formatMinutes(h.avg_minutes)}</td>
                    <td>{h.revenue.toLocaleString()} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By table */}
      {by_table.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3>По столикам</h3>
            <button className="btn btn-ghost" onClick={handleExport}>Экспорт CSV</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Столик</th>
                  <th>Зал</th>
                  <th>Заказов</th>
                  <th>Ср. время</th>
                  <th>Выручка</th>
                </tr>
              </thead>
              <tbody>
                {by_table.map(t => (
                  <tr key={t.id}>
                    <td>{t.label || `#${t.number}`}</td>
                    <td>{t.hall_name}</td>
                    <td>{t.orders_count}</td>
                    <td>{formatMinutes(t.avg_minutes)}</td>
                    <td>{t.revenue.toLocaleString()} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
