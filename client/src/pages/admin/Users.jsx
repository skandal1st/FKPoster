import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import ModalOverlay from '../../components/ModalOverlay';

const roleLabel = (r) => {
  if (r === 'owner') return 'Владелец';
  if (r === 'admin') return 'Администратор';
  return 'Кассир';
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', role: 'cashier', pin: '' });

  const load = async () => {
    const usersList = await api.get('/users');
    setUsers(usersList);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', role: 'cashier', pin: '' });
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ name: u.name, role: u.role, pin: '' });
    setShowModal(true);
  };

  const save = async () => {
    try {
      if (editing) {
        const data = { name: form.name, role: form.role };
        if (form.pin) data.pin = form.pin;
        await api.put(`/users/${editing.id}`, data);
        toast.success('Сотрудник обновлён');
      } else {
        const name = (form.name || '').trim();
        const pin = (form.pin || '').trim();
        if (!name) { toast.error('Укажите имя'); return; }
        if (!pin) { toast.error('Укажите PIN-код'); return; }
        if (!/^\d{4}$/.test(pin)) { toast.error('PIN-код должен быть 4 цифры'); return; }
        await api.post('/users', { name, role: form.role, pin });
        toast.success('Сотрудник создан');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Деактивировать сотрудника?')) return;
    await api.delete(`/users/${id}`);
    toast.success('Сотрудник деактивирован');
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Сотрудники</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Добавить
        </button>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Роль</th>
              <th>PIN</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{roleLabel(u.role)}</td>
                <td>
                  {u.has_pin
                    ? <span className="badge badge-success">Есть</span>
                    : <span className="badge" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>Нет</span>
                  }
                </td>
                <td>
                  {u.active
                    ? <span className="badge badge-success">Активен</span>
                    : <span className="badge badge-danger">Неактивен</span>
                  }
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-icon" onClick={() => openEdit(u)}><Pencil size={15} /></button>
                  {u.active ? <button className="btn-icon" onClick={() => remove(u.id)}><Trash2 size={15} /></button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Редактировать' : 'Новый сотрудник'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Имя</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">{editing ? 'Новый PIN-код (оставьте пустым)' : 'PIN-код (4 цифры)'}</label>
              <input
                className="form-input"
                type="text"
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                value={form.pin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setForm({ ...form, pin: v });
                }}
                placeholder={editing ? '' : '0000'}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Роль</label>
              <select className="form-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="cashier">Кассир</option>
                <option value="admin">Администратор</option>
              </select>
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
