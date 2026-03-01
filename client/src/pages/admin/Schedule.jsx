import { useEffect, useState, useMemo } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';

const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function formatMonth(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/** Возвращает день недели 0=Пн, 6=Вс */
function getDayOfWeek(year, month, day) {
  const d = new Date(year, month, day).getDay();
  return d === 0 ? 6 : d - 1; // Пн=0
}

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [employees, setEmployees] = useState([]);
  const [schedule, setSchedule] = useState({}); // { "userId-date": scheduleId }
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysCount = getDaysInMonth(year, month);
  const monthKey = formatMonth(currentDate);

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadSchedule();
  }, [monthKey]);

  const loadEmployees = async () => {
    try {
      const users = await api.get('/users');
      setEmployees(users.filter((u) => u.active));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const loadSchedule = async () => {
    try {
      const data = await api.get(`/schedule?month=${monthKey}`);
      const map = {};
      for (const entry of data) {
        const dateStr = entry.date.slice(0, 10);
        map[`${entry.user_id}-${dateStr}`] = entry.id;
      }
      setSchedule(map);
      setDirty(false);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleCell = (userId, day) => {
    const dateStr = formatDate(year, month, day);
    const key = `${userId}-${dateStr}`;
    setSchedule((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = true; // новая запись (ещё не сохранена)
      }
      return next;
    });
    setDirty(true);
  };

  const saveBulk = async () => {
    setSaving(true);
    try {
      const entries = [];
      for (const key of Object.keys(schedule)) {
        const sep = key.indexOf('-');
        const userId = key.slice(0, sep);
        const date = key.slice(sep + 1);
        entries.push({ user_id: parseInt(userId), date });
      }
      await api.post('/schedule/bulk', { entries, month: monthKey });
      toast.success('График сохранён');
      await loadSchedule();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // Подсчёт дней для каждого сотрудника
  const employeeDays = useMemo(() => {
    const counts = {};
    for (const key of Object.keys(schedule)) {
      const userId = key.split('-')[0];
      counts[userId] = (counts[userId] || 0) + 1;
    }
    return counts;
  }, [schedule]);

  // Подсчёт сотрудников на каждый день
  const dayCounts = useMemo(() => {
    const counts = {};
    for (let d = 1; d <= daysCount; d++) {
      const dateStr = formatDate(year, month, d);
      let count = 0;
      for (const emp of employees) {
        if (schedule[`${emp.id}-${dateStr}`]) count++;
      }
      counts[d] = count;
    }
    return counts;
  }, [schedule, employees, year, month, daysCount]);

  const days = [];
  for (let d = 1; d <= daysCount; d++) {
    days.push(d);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">График работы</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={prevMonth}><ChevronLeft size={18} /></button>
            <span style={{ minWidth: 160, textAlign: 'center', fontWeight: 600, fontSize: 16 }}>
              {MONTHS_RU[month]} {year}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={nextMonth}><ChevronRight size={18} /></button>
          </div>
          {dirty && (
            <button className="btn btn-primary" onClick={saveBulk} disabled={saving}>
              <Save size={16} /> {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table schedule-table" style={{ minWidth: daysCount * 36 + 200 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--card-bg)', zIndex: 2, minWidth: 150 }}>
                Сотрудник
              </th>
              {days.map((d) => {
                const dow = getDayOfWeek(year, month, d);
                const isWeekend = dow >= 5;
                return (
                  <th
                    key={d}
                    style={{
                      textAlign: 'center',
                      minWidth: 36,
                      padding: '4px 2px',
                      background: isWeekend ? 'rgba(255,255,255,0.05)' : undefined,
                      fontSize: 12,
                    }}
                  >
                    <div>{d}</div>
                    <div style={{ color: isWeekend ? 'var(--danger)' : 'var(--text-muted)', fontSize: 10 }}>
                      {WEEKDAYS_SHORT[dow]}
                    </div>
                  </th>
                );
              })}
              <th style={{ textAlign: 'center', minWidth: 50, padding: '4px 6px' }}>Дней</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--card-bg)', zIndex: 1, fontWeight: 500 }}>
                  {emp.name}
                </td>
                {days.map((d) => {
                  const dateStr = formatDate(year, month, d);
                  const key = `${emp.id}-${dateStr}`;
                  const isActive = !!schedule[key];
                  const dow = getDayOfWeek(year, month, d);
                  const isWeekend = dow >= 5;
                  return (
                    <td
                      key={d}
                      onClick={() => toggleCell(emp.id, d)}
                      style={{
                        textAlign: 'center',
                        cursor: 'pointer',
                        padding: '4px 2px',
                        background: isActive
                          ? 'var(--accent)'
                          : isWeekend
                            ? 'rgba(255,255,255,0.03)'
                            : undefined,
                        borderRadius: 4,
                        transition: 'background 0.15s',
                        userSelect: 'none',
                      }}
                    >
                      {isActive && (
                        <div style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#fff',
                          margin: '0 auto',
                        }} />
                      )}
                    </td>
                  );
                })}
                <td style={{ textAlign: 'center', fontWeight: 600 }}>
                  {employeeDays[emp.id] || 0}
                </td>
              </tr>
            ))}
            {/* Итого: количество сотрудников на каждый день */}
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <td style={{ position: 'sticky', left: 0, background: 'var(--card-bg)', zIndex: 1, fontWeight: 600, color: 'var(--text-muted)' }}>
                На смене
              </td>
              {days.map((d) => (
                <td key={d} style={{ textAlign: 'center', padding: '4px 2px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 12 }}>
                  {dayCounts[d] || ''}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
        {employees.length === 0 && (
          <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>
            Нет сотрудников
          </div>
        )}
      </div>
    </div>
  );
}
