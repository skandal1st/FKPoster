import { useEffect, useState, Fragment } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { X, Plus, Trash2, Pencil, ChevronDown, ChevronUp, Wallet } from 'lucide-react';
import ModalOverlay from '../../components/ModalOverlay';

const TABS = [
  { key: 'settings', label: 'Настройки' },
  { key: 'calculate', label: 'Расчёт' },
  { key: 'payouts', label: 'Выплаты' },
];

function formatMoney(n) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' \u20BD';
}

function getDefaultPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export default function Salary() {
  const [tab, setTab] = useState('settings');

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Зарплата</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'settings' && <SettingsTab />}
      {tab === 'calculate' && <CalculateTab />}
      {tab === 'payouts' && <PayoutsTab />}
    </div>
  );
}

// ========== Вкладка «Настройки» ==========

function SettingsTab() {
  const [employees, setEmployees] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [editModal, setEditModal] = useState(null);
  const [form, setForm] = useState({ daily_rate: 0, workshop_rates: [] });

  useEffect(() => {
    load();
    loadWorkshops();
  }, []);

  const load = async () => {
    try {
      setEmployees(await api.get('/salary/settings'));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const loadWorkshops = async () => {
    try {
      setWorkshops(await api.get('/workshops'));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openEdit = (emp) => {
    setEditModal(emp);
    // Заполнить форму — для каждого цеха найти текущий процент
    const rates = workshops.map((w) => {
      const existing = emp.workshop_rates.find((r) => r.workshop_id === w.id);
      return {
        workshop_id: w.id,
        workshop_name: w.name,
        percentage: existing ? existing.percentage : 0,
        enabled: existing ? existing.percentage > 0 : false,
      };
    });
    setForm({ daily_rate: emp.daily_rate, workshop_rates: rates });
  };

  const save = async () => {
    try {
      const payload = {
        daily_rate: form.daily_rate,
        workshop_rates: form.workshop_rates
          .filter((r) => r.enabled && r.percentage > 0)
          .map((r) => ({ workshop_id: r.workshop_id, percentage: r.percentage })),
      };
      await api.put(`/salary/settings/${editModal.id}`, payload);
      toast.success('Настройки сохранены');
      setEditModal(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleWorkshop = (idx) => {
    setForm((prev) => {
      const rates = [...prev.workshop_rates];
      rates[idx] = { ...rates[idx], enabled: !rates[idx].enabled };
      if (!rates[idx].enabled) rates[idx].percentage = 0;
      return { ...prev, workshop_rates: rates };
    });
  };

  const setWorkshopPct = (idx, pct) => {
    setForm((prev) => {
      const rates = [...prev.workshop_rates];
      rates[idx] = { ...rates[idx], percentage: parseFloat(pct) || 0 };
      return { ...prev, workshop_rates: rates };
    });
  };

  return (
    <>
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Роль</th>
              <th>Ставка/день</th>
              <th>Цеха</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td style={{ fontWeight: 500 }}>{emp.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{emp.role}</td>
                <td>{formatMoney(emp.daily_rate)}</td>
                <td>
                  {emp.workshop_rates.length > 0
                    ? emp.workshop_rates.map((r) => `${r.workshop_name}: ${r.percentage}%`).join(', ')
                    : <span style={{ color: 'var(--text-muted)' }}>—</span>
                  }
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-icon" onClick={() => openEdit(emp)} title="Редактировать">
                    <Pencil size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {employees.length === 0 && (
          <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет сотрудников</div>
        )}
      </div>

      {editModal && (
        <ModalOverlay onClose={() => setEditModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Настройки: {editModal.name}</h3>
              <button className="btn-icon" onClick={() => setEditModal(null)}><X size={18} /></button>
            </div>

            <div className="form-group">
              <label className="form-label">Ставка за день</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="100"
                value={form.daily_rate}
                onChange={(e) => setForm({ ...form, daily_rate: parseFloat(e.target.value) || 0 })}
              />
            </div>

            {form.workshop_rates.length > 0 && (
              <div className="form-group">
                <label className="form-label">Процент от продаж по цехам</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {form.workshop_rates.map((r, i) => (
                    <div key={r.workshop_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minWidth: 140 }}>
                        <input
                          type="checkbox"
                          checked={r.enabled}
                          onChange={() => toggleWorkshop(i)}
                        />
                        {r.workshop_name}
                      </label>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={r.percentage}
                        onChange={(e) => setWorkshopPct(i, e.target.value)}
                        disabled={!r.enabled}
                        style={{ width: 80 }}
                        placeholder="%"
                      />
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setEditModal(null)}>Отмена</button>
              <button className="btn btn-primary" onClick={save}>Сохранить</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}

// ========== Вкладка «Расчёт» ==========

function CalculateTab() {
  const defaultPeriod = getDefaultPeriod();
  const [from, setFrom] = useState(defaultPeriod.from);
  const [to, setTo] = useState(defaultPeriod.to);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ amount: 0, note: '' });

  const calculate = async () => {
    setLoading(true);
    try {
      const result = await api.get(`/salary/calculate?from=${from}&to=${to}`);
      setData(result);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculate();
  }, []);

  const toggleRow = (userId) => {
    setExpandedRows((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const openPayModal = (emp) => {
    setPayModal(emp);
    setPayForm({ amount: Math.max(0, emp.remaining), note: '' });
  };

  const submitPay = async () => {
    if (!payForm.amount || payForm.amount <= 0) {
      return toast.error('Укажите сумму');
    }
    try {
      await api.post('/salary/payouts', {
        user_id: payModal.user_id,
        amount: payForm.amount,
        period_from: from,
        period_to: to,
        note: payForm.note,
      });
      toast.success('Выплата создана');
      setPayModal(null);
      calculate();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const totals = data ? {
    totalSalary: data.employees.reduce((s, e) => s + e.total_salary, 0),
    totalBonus: data.employees.reduce((s, e) => s + e.total_bonus, 0),
    totalDaily: data.employees.reduce((s, e) => s + e.daily_total, 0),
    totalPaid: data.employees.reduce((s, e) => s + e.total_paid, 0),
    totalRemaining: data.employees.reduce((s, e) => s + e.remaining, 0),
  } : null;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">От</label>
          <input className="form-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">До</label>
          <input className="form-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={calculate} disabled={loading}>
          {loading ? 'Расчёт...' : 'Рассчитать'}
        </button>
      </div>

      {data && totals && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-label">Ставки</div>
              <div className="stat-value">{formatMoney(totals.totalDaily)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Бонусы по цехам</div>
              <div className="stat-value">{formatMoney(totals.totalBonus)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Итого ФОТ</div>
              <div className="stat-value">{formatMoney(totals.totalSalary)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Выплачено</div>
              <div className="stat-value">{formatMoney(totals.totalPaid)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Остаток</div>
              <div className="stat-value" style={{ color: totals.totalRemaining > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {formatMoney(totals.totalRemaining)}
              </div>
            </div>
          </div>

          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Сотрудник</th>
                  <th>Дней</th>
                  <th>Ставка × дни</th>
                  <th>Бонус</th>
                  <th>Итого</th>
                  <th>Выплачено</th>
                  <th>Остаток</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map((emp) => {
                  const expanded = expandedRows[emp.user_id];
                  const hasDetails = emp.workshop_bonuses.length > 0;
                  return (
                    <Fragment key={emp.user_id}>
                      <tr>
                        <td style={{ width: 30, padding: '4px' }}>
                          {hasDetails && (
                            <button className="btn-icon" onClick={() => toggleRow(emp.user_id)}>
                              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          )}
                        </td>
                        <td style={{ fontWeight: 500 }}>{emp.name}</td>
                        <td>{emp.days_worked}</td>
                        <td>{formatMoney(emp.daily_total)}</td>
                        <td>{formatMoney(emp.total_bonus)}</td>
                        <td style={{ fontWeight: 600 }}>{formatMoney(emp.total_salary)}</td>
                        <td>{formatMoney(emp.total_paid)}</td>
                        <td style={{ fontWeight: 600, color: emp.remaining > 0 ? 'var(--danger)' : 'var(--success)' }}>
                          {formatMoney(emp.remaining)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {emp.remaining > 0 && (
                            <button className="btn btn-primary btn-sm" onClick={() => openPayModal(emp)}>
                              <Wallet size={14} /> Выплатить
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && emp.workshop_bonuses.map((wb) => (
                        <tr key={wb.workshop_id} style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <td></td>
                          <td colSpan={3} style={{ paddingLeft: 24, color: 'var(--text-muted)', fontSize: 13 }}>
                            {wb.name}: выручка {formatMoney(wb.revenue)} × {wb.percentage}%
                          </td>
                          <td style={{ fontSize: 13 }}>{formatMoney(wb.bonus)}</td>
                          <td colSpan={4}></td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {data.employees.length === 0 && (
              <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет данных</div>
            )}
          </div>
        </>
      )}

      {payModal && (
        <ModalOverlay onClose={() => setPayModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">Выплата: {payModal.name}</h3>
              <button className="btn-icon" onClick={() => setPayModal(null)}><X size={18} /></button>
            </div>

            <div style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 13 }}>
              Начислено: {formatMoney(payModal.total_salary)} | Выплачено: {formatMoney(payModal.total_paid)} | Остаток: {formatMoney(payModal.remaining)}
            </div>

            <div className="form-group">
              <label className="form-label">Сумма</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="100"
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: parseFloat(e.target.value) || 0 })}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Комментарий</label>
              <input
                className="form-input"
                value={payForm.note}
                onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
                placeholder="Необязательно"
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setPayModal(null)}>Отмена</button>
              <button className="btn btn-primary" onClick={submitPay}>Выплатить</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}

// ========== Вкладка «Выплаты» ==========

function PayoutsTab() {
  const defaultPeriod = getDefaultPeriod();
  const [from, setFrom] = useState(defaultPeriod.from);
  const [to, setTo] = useState(defaultPeriod.to);
  const [payouts, setPayouts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ user_id: '', amount: 0, period_from: defaultPeriod.from, period_to: defaultPeriod.to, note: '' });

  useEffect(() => {
    loadPayouts();
    loadEmployees();
  }, []);

  const loadPayouts = async () => {
    try {
      const data = await api.get(`/salary/payouts?from=${from}&to=${to}`);
      setPayouts(data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const loadEmployees = async () => {
    try {
      const users = await api.get('/users');
      setEmployees(users.filter((u) => u.active));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removePayout = async (id) => {
    if (!confirm('Удалить выплату?')) return;
    try {
      await api.delete(`/salary/payouts/${id}`);
      toast.success('Выплата удалена');
      loadPayouts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const createPayout = async () => {
    if (!form.user_id || !form.amount || form.amount <= 0) {
      return toast.error('Заполните сотрудника и сумму');
    }
    try {
      await api.post('/salary/payouts', {
        user_id: parseInt(form.user_id),
        amount: form.amount,
        period_from: form.period_from,
        period_to: form.period_to,
        note: form.note,
      });
      toast.success('Выплата создана');
      setShowModal(false);
      loadPayouts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const formatDateRu = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('ru-RU');
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">От</label>
          <input className="form-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">До</label>
          <input className="form-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn btn-ghost" onClick={loadPayouts}>Показать</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => {
          setForm({ user_id: '', amount: 0, period_from: from, period_to: to, note: '' });
          setShowModal(true);
        }}>
          <Plus size={16} /> Новая выплата
        </button>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Сотрудник</th>
              <th>Сумма</th>
              <th>Период</th>
              <th>Комментарий</th>
              <th>Кто выплатил</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id}>
                <td>{formatDateRu(p.created_at)}</td>
                <td style={{ fontWeight: 500 }}>{p.user_name}</td>
                <td style={{ fontWeight: 600 }}>{formatMoney(p.amount)}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {formatDateRu(p.period_from)} — {formatDateRu(p.period_to)}
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{p.note || '—'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{p.paid_by_name || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-icon" onClick={() => removePayout(p.id)} title="Удалить">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {payouts.length === 0 && (
          <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет выплат за этот период</div>
        )}
      </div>

      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Новая выплата</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            <div className="form-group">
              <label className="form-label">Сотрудник</label>
              <select
                className="form-input"
                value={form.user_id}
                onChange={(e) => setForm({ ...form, user_id: e.target.value })}
              >
                <option value="">Выберите...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Сумма</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="100"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Период от</label>
                <input className="form-input" type="date" value={form.period_from} onChange={(e) => setForm({ ...form, period_from: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Период до</label>
                <input className="form-input" type="date" value={form.period_to} onChange={(e) => setForm({ ...form, period_to: e.target.value })} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Комментарий</label>
              <input
                className="form-input"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Необязательно"
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={createPayout}>Создать</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
