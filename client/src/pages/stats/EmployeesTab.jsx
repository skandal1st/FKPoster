import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { exportToCsv } from '../../utils/exportCsv';

export default function EmployeesTab({ from, to }) {
  const [data, setData] = useState({ employees: [] });

  useEffect(() => {
    api.get(`/stats/employees?from=${from}&to=${to}`).then(setData);
  }, [from, to]);

  const { employees } = data;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => {
          const headers = ['Сотрудник', 'Заказов', 'Выручка', 'Ср. чек', 'Наличные', 'Карта'];
          const rows = employees.map((e) => [e.name, e.orders_count, e.revenue, e.avg_check, e.cash_total, e.card_total]);
          exportToCsv('employees.csv', headers, rows);
        }}><Download size={14} /> CSV</button>
      </div>

      {/* Chart */}
      {employees.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Выручка по сотрудникам</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, employees.length * 50)}>
            <BarChart data={employees} layout="vertical">
              <CartesianGrid stroke="var(--border-color)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} width={120} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
                formatter={(value) => [value.toLocaleString() + ' ₽', 'Выручка']}
              />
              <Bar dataKey="revenue" fill="var(--accent)" name="Выручка" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Детализация</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Сотрудник</th>
              <th>Заказов</th>
              <th>Выручка</th>
              <th>Ср. чек</th>
              <th>Наличные</th>
              <th>Карта</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e, idx) => (
              <tr key={e.id}>
                <td>{idx + 1}</td>
                <td>{e.name}</td>
                <td>{e.orders_count}</td>
                <td>{e.revenue.toLocaleString()} ₽</td>
                <td>{e.avg_check.toLocaleString()} ₽</td>
                <td>{e.cash_total.toLocaleString()} ₽</td>
                <td>{e.card_total.toLocaleString()} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
        {employees.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет данных за период</div>}
      </div>
    </>
  );
}
