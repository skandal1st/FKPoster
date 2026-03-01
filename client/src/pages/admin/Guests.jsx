import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, User, BarChart3 } from 'lucide-react';
import ModalOverlay from '../../components/ModalOverlay';

function discountLabel(guest) {
  if (guest.discount_type === 'percent') {
    return `Скидка ${guest.discount_value}%`;
  }
  return `Скидка ${guest.discount_value} ₽`;
}

function getMonthBounds(monthsAgo = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  const from = d.toISOString().slice(0, 10);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  const to = d.toISOString().slice(0, 10);
  return { from, to };
}

export default function Guests() {
  const [guests, setGuests] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    discount_type: 'percent',
    discount_value: 0,
    bonus_balance: 0,
  });
  const [detailGuest, setDetailGuest] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsPeriod, setStatsPeriod] = useState(0); // 0 = этот месяц, 1 = прошлый, ...

  const load = async () => {
    const list = await api.get('/guests' + (search ? `?search=${encodeURIComponent(search)}` : ''));
    setGuests(list);
  };

  useEffect(() => {
    load();
  }, [search]);

  useEffect(() => {
    if (!detailGuest) {
      setStats(null);
      return;
    }
    const { from, to } = getMonthBounds(statsPeriod);
    api.get(`/guests/${detailGuest.id}/stats?from=${from}&to=${to}`)
      .then(setStats)
      .catch(() => setStats(null));
  }, [detailGuest, statsPeriod]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', phone: '', discount_type: 'percent', discount_value: 0, bonus_balance: 0 });
    setShowModal(true);
  };

  const openEdit = (g) => {
    setEditing(g);
    setForm({
      name: g.name,
      phone: g.phone || '',
      discount_type: g.discount_type || 'percent',
      discount_value: g.discount_value ?? 0,
      bonus_balance: g.bonus_balance ?? 0,
    });
    setShowModal(true);
  };

  const save = async () => {
    try {
      const nameStr = (form.name || '').trim();
      if (!nameStr) {
        toast.error('Укажите имя гостя');
        return;
      }
      if (editing) {
        await api.put(`/guests/${editing.id}`, {
          name: nameStr,
          phone: form.phone || null,
          discount_type: form.discount_type,
          discount_value: parseFloat(form.discount_value) || 0,
          bonus_balance: parseFloat(form.bonus_balance) || 0,
        });
        toast.success('Гость обновлён');
      } else {
        await api.post('/guests', {
          name: nameStr,
          phone: form.phone || null,
          discount_type: form.discount_type,
          discount_value: parseFloat(form.discount_value) || 0,
          bonus_balance: parseFloat(form.bonus_balance) || 0,
        });
        toast.success('Гость добавлен');
      }
      setShowModal(false);
      load();
      if (detailGuest && editing && detailGuest.id === editing.id) {
        setDetailGuest({ ...detailGuest, ...form });
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Деактивировать гостя? Заказы сохранятся.')) return;
    try {
      await api.delete(`/guests/${id}`);
      toast.success('Гость деактивирован');
      if (detailGuest?.id === id) setDetailGuest(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const monthOptions = [
    { value: 0, label: 'Текущий месяц' },
    { value: 1, label: 'Прошлый месяц' },
    { value: 2, label: '2 месяца назад' },
    { value: 3, label: '3 месяца назад' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Гости и программа лояльности</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Добавить гостя
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 320 }}>
          <label className="form-label">Поиск по имени или телефону</label>
          <input
            className="form-input"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Имя или телефон"
          />
        </div>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Телефон</th>
              <th>Скидка</th>
              <th>Бонусы</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td>{g.phone || '—'}</td>
                <td>{discountLabel(g)}</td>
                <td>{g.bonus_balance ? `${g.bonus_balance} ₽` : '—'}</td>
                <td>
                  {g.active !== false
                    ? <span className="badge badge-success">Активен</span>
                    : <span className="badge badge-danger">Неактивен</span>
                  }
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-icon" onClick={() => setDetailGuest(g)} title="Статистика">
                    <BarChart3 size={15} />
                  </button>
                  <button className="btn-icon" onClick={() => openEdit(g)}><Pencil size={15} /></button>
                  {g.active !== false && (
                    <button className="btn-icon" onClick={() => remove(g.id)}><Trash2 size={15} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {guests.length === 0 && (
          <p style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
            Нет гостей. Добавьте гостя, чтобы выдавать скидки и бонусные карты.
          </p>
        )}
      </div>

      {detailGuest && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>
              <User size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              {detailGuest.name}
              {detailGuest.phone && (
                <span style={{ fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: 8 }}>
                  {detailGuest.phone}
                </span>
              )}
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setDetailGuest(null)}><X size={16} /></button>
          </div>
          <p style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 14 }}>
            {discountLabel(detailGuest)}
            {detailGuest.bonus_balance > 0 && ` • Бонусов: ${detailGuest.bonus_balance} ₽`}
          </p>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Период</label>
            <select
              className="form-input"
              style={{ maxWidth: 220 }}
              value={statsPeriod}
              onChange={(e) => setStatsPeriod(Number(e.target.value))}
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {stats ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
              <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Заказов</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.orders_count}</div>
              </div>
              <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Сумма заказов</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{Number(stats.total_ordered).toFixed(0)} ₽</div>
              </div>
              <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Скидка за период</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>
                  −{Number(stats.total_discount).toFixed(0)} ₽
                </div>
              </div>
              <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>К оплате</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{Number(stats.total_paid).toFixed(0)} ₽</div>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Нет данных за выбранный период</p>
          )}
        </div>
      )}

      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Редактировать гостя' : 'Новый гость'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Имя *</label>
              <input
                className="form-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Иван Иванов"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Телефон</label>
              <input
                className="form-input"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+7 900 123-45-67"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Тип скидки</label>
              <select
                className="form-input"
                value={form.discount_type}
                onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
              >
                <option value="percent">Процент (%)</option>
                <option value="fixed">Фиксированная сумма (₽)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">
                {form.discount_type === 'percent' ? 'Процент скидки (0–100)' : 'Сумма скидки (₽)'}
              </label>
              <input
                className="form-input"
                type="number"
                min={0}
                max={form.discount_type === 'percent' ? 100 : undefined}
                step={form.discount_type === 'percent' ? 1 : 0.01}
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Бонусный баланс (₽)</label>
              <input
                className="form-input"
                type="number"
                min={0}
                step={0.01}
                value={form.bonus_balance}
                onChange={(e) => setForm({ ...form, bonus_balance: e.target.value })}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={save}>Сохранить</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
