import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { DoorOpen, DoorClosed, Clock, FileBarChart, Trash2, X } from 'lucide-react';
import ShiftReportModal from '../../components/ShiftReportModal';

const emptyExpenseForm = { description: '', amount: '', payment_type: 'cash' };

export default function Register() {
  const [day, setDay] = useState(null);
  const [history, setHistory] = useState([]);
  const [openingCash, setOpeningCash] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedShiftId, setSelectedShiftId] = useState(null);
  const [workshopTotals, setWorkshopTotals] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [d, h] = await Promise.all([api.get('/register/current'), api.get('/register/history')]);
    setDay(d);
    setHistory(h);
    if (d) {
      const [ws, exps] = await Promise.all([
        api.get('/register/current/workshops').catch(() => []),
        api.get(`/cash-operations?register_day_id=${d.id}`).catch(() => []),
      ]);
      setWorkshopTotals(ws);
      setExpenses(exps);
    } else {
      setWorkshopTotals([]);
      setExpenses([]);
    }
    setLoading(false);
  };

  const openDay = async () => {
    try {
      const d = await api.post('/register/open', { opening_cash: Number(openingCash) || 0 });
      setDay(d);
      setOpeningCash('');
      toast.success('Кассовый день открыт');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const closeDay = async () => {
    if (!confirm('Закрыть кассовый день?')) return;
    try {
      await api.post('/register/close', { actual_cash: Number(actualCash) || 0 });
      setDay(null);
      setActualCash('');
      toast.success('Кассовый день закрыт');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAddExpense = async () => {
    const desc = (expenseForm.description || '').trim();
    if (!desc) { toast.error('Введите описание'); return; }
    const amt = parseFloat(expenseForm.amount);
    if (!amt || amt <= 0) { toast.error('Введите сумму больше нуля'); return; }

    setExpenseSubmitting(true);
    try {
      const newOp = await api.post('/cash-operations', {
        description: desc,
        amount: amt,
        payment_type: expenseForm.payment_type,
        type: 'expense',
      });
      setExpenses((prev) => [newOp, ...prev]);
      // Обновить балансы локально
      setDay((prev) => {
        if (!prev) return prev;
        const expCash = newOp.payment_type === 'cash' ? (parseFloat(prev.total_expenses_cash) || 0) + amt : (parseFloat(prev.total_expenses_cash) || 0);
        const expCard = newOp.payment_type === 'card' ? (parseFloat(prev.total_expenses_card) || 0) + amt : (parseFloat(prev.total_expenses_card) || 0);
        return {
          ...prev,
          total_expenses_cash: expCash,
          total_expenses_card: expCard,
          cash_balance: (parseFloat(prev.expected_cash) || 0) - expCash,
          card_balance: (parseFloat(prev.total_card) || 0) - expCard,
        };
      });
      setShowExpenseModal(false);
      setExpenseForm(emptyExpenseForm);
      toast.success('Расход добавлен');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExpenseSubmitting(false);
    }
  };

  const handleDeleteExpense = async (expense) => {
    if (!confirm(`Удалить расход «${expense.description}»?`)) return;
    try {
      await api.delete(`/cash-operations/${expense.id}`);
      const amt = parseFloat(expense.amount);
      setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
      setDay((prev) => {
        if (!prev) return prev;
        const expCash = expense.payment_type === 'cash' ? Math.max(0, (parseFloat(prev.total_expenses_cash) || 0) - amt) : (parseFloat(prev.total_expenses_cash) || 0);
        const expCard = expense.payment_type === 'card' ? Math.max(0, (parseFloat(prev.total_expenses_card) || 0) - amt) : (parseFloat(prev.total_expenses_card) || 0);
        return {
          ...prev,
          total_expenses_cash: expCash,
          total_expenses_card: expCard,
          cash_balance: (parseFloat(prev.expected_cash) || 0) - expCash,
          card_balance: (parseFloat(prev.total_card) || 0) - expCard,
        };
      });
      toast.success('Расход удалён');
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <div className="spinner" />;

  const cashBalance = day ? (parseFloat(day.cash_balance) ?? parseFloat(day.expected_cash) ?? 0) : 0;
  const cardBalance = day ? (parseFloat(day.card_balance) ?? parseFloat(day.total_card) ?? 0) : 0;
  const expCash = day ? (parseFloat(day.total_expenses_cash) || 0) : 0;
  const expCard = day ? (parseFloat(day.total_expenses_card) || 0) : 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Кассовый день</h1>
      </div>

      {!day ? (
        <div className="card" style={{ maxWidth: 400 }}>
          <h3 style={{ marginBottom: 16 }}>Открыть кассовый день</h3>
          <div className="form-group">
            <label className="form-label">Наличные в кассе на начало</label>
            <input className="form-input" type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="0" />
          </div>
          <button className="btn btn-success" onClick={openDay} style={{ width: '100%' }}>
            <DoorOpen size={16} /> Открыть день
          </button>
        </div>
      ) : (
        <>
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-label">Статус</div>
              <div className="stat-value" style={{ color: 'var(--success)', fontSize: 18 }}>Открыт</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {new Date(day.opened_at).toLocaleString('ru')}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Выручка</div>
              <div className="stat-value">{Number(day.total_sales).toLocaleString('ru')} ₽</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Наличная касса</div>
              <div className="stat-value">{cashBalance.toLocaleString('ru')} ₽</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Поступило: {Number(day.total_cash).toLocaleString('ru')} ₽
                {expCash > 0 && <> / Расходы: −{expCash.toLocaleString('ru')} ₽</>}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Безналичная касса</div>
              <div className="stat-value">{cardBalance.toLocaleString('ru')} ₽</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Поступило: {Number(day.total_card).toLocaleString('ru')} ₽
                {expCard > 0 && <> / Расходы: −{expCard.toLocaleString('ru')} ₽</>}
              </div>
            </div>
          </div>

          {workshopTotals.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 16 }}>По цехам</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Цех</th>
                    <th>Выручка</th>
                    <th>Наличные</th>
                    <th>Карта</th>
                  </tr>
                </thead>
                <tbody>
                  {workshopTotals.map((wt, idx) => (
                    <tr key={wt.id || `no-ws-${idx}`}>
                      <td>{wt.name || 'Без цеха'}</td>
                      <td>{wt.revenue.toLocaleString()} ₽</td>
                      <td>{wt.cash.toLocaleString()} ₽</td>
                      <td>{wt.card.toLocaleString()} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Расходные операции */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Расходные операции</h3>
              <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setShowExpenseModal(true)}>
                + Добавить расход
              </button>
            </div>
            {expenses.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Время</th>
                    <th>Сотрудник</th>
                    <th>Описание</th>
                    <th>Тип</th>
                    <th>Сумма</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td>{new Date(e.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{e.user_name || '—'}</td>
                      <td>{e.description}</td>
                      <td>{e.payment_type === 'cash' ? 'Наличные' : 'Карта'}</td>
                      <td style={{ color: 'var(--danger)', fontWeight: 500 }}>−{Number(e.amount).toLocaleString('ru')} ₽</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn-icon" onClick={() => handleDeleteExpense(e)} title="Удалить">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: 'var(--text-muted)', padding: '8px 0' }}>Расходов нет</div>
            )}
          </div>

          <div className="card" style={{ maxWidth: 400 }}>
            <h3 style={{ marginBottom: 16 }}>Закрыть кассовый день</h3>
            <div style={{ marginBottom: 4, fontSize: 14, color: 'var(--text-secondary)' }}>
              Наличная касса: <strong>{cashBalance.toLocaleString('ru')} ₽</strong>
            </div>
            {expCash > 0 && (
              <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                Поступило: {Number(day.expected_cash).toLocaleString('ru')} ₽ / Расходы: −{expCash.toLocaleString('ru')} ₽
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Фактические наличные в кассе</label>
              <input className="form-input" type="number" value={actualCash} onChange={(e) => setActualCash(e.target.value)} placeholder={cashBalance} />
            </div>
            <button className="btn btn-danger" onClick={closeDay} style={{ width: '100%' }}>
              <DoorClosed size={16} /> Закрыть день
            </button>
          </div>
        </>
      )}

      {/* История */}
      <h3 style={{ marginTop: 32, marginBottom: 16 }}>История</h3>
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Статус</th>
              <th>Продажи</th>
              <th>Наличные</th>
              <th>Карта</th>
              <th>Расхождение</th>
              <th>Отчёт</th>
            </tr>
          </thead>
          <tbody>
            {history.map((d) => (
              <tr key={d.id}>
                <td>{new Date(d.opened_at).toLocaleDateString('ru')}</td>
                <td>
                  {d.status === 'open'
                    ? <span className="badge badge-success">Открыт</span>
                    : <span className="badge badge-warning">Закрыт</span>
                  }
                </td>
                <td>{d.total_sales} ₽</td>
                <td>{d.total_cash} ₽</td>
                <td>{d.total_card} ₽</td>
                <td>
                  {d.status === 'closed' && d.actual_cash != null
                    ? `${(d.actual_cash - d.expected_cash).toFixed(0)} ₽`
                    : '—'
                  }
                </td>
                <td>
                  <button className="btn-icon" onClick={() => setSelectedShiftId(d.id)} title="Отчёт по смене">
                    <FileBarChart size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет истории</div>}
      </div>

      {selectedShiftId && (
        <ShiftReportModal shiftId={selectedShiftId} onClose={() => setSelectedShiftId(null)} />
      )}

      {/* Модалка добавления расхода */}
      {showExpenseModal && (
        <div className="modal-overlay" onClick={() => setShowExpenseModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">Добавить расход</h3>
              <button className="btn-icon" onClick={() => setShowExpenseModal(false)}><X size={18} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Описание *</label>
              <input
                className="form-input"
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                placeholder="Например: закупка расходников"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Сумма *</label>
              <input
                className="form-input"
                type="number"
                min="0.01"
                step="0.01"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Тип оплаты</label>
              <div style={{ display: 'flex', gap: 20, marginTop: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="exp_payment_type"
                    value="cash"
                    checked={expenseForm.payment_type === 'cash'}
                    onChange={() => setExpenseForm({ ...expenseForm, payment_type: 'cash' })}
                  />
                  Наличные
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="exp_payment_type"
                    value="card"
                    checked={expenseForm.payment_type === 'card'}
                    onChange={() => setExpenseForm({ ...expenseForm, payment_type: 'card' })}
                  />
                  Карта
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowExpenseModal(false)}>Отмена</button>
              <button className="btn btn-danger" onClick={handleAddExpense} disabled={expenseSubmitting}>
                {expenseSubmitting ? 'Сохранение...' : 'Добавить расход'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
