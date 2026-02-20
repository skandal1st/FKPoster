import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X } from 'lucide-react';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'cashier' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setUsers(await api.get('/users'));
  };

  const openNew = () => {
    setEditing(null);
    setForm({ username: '', password: '', name: '', role: 'cashier' });
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ username: u.username, password: '', name: u.name, role: u.role });
    setShowModal(true);
  };

  const save = async () => {
    try {
      if (editing) {
        const data = { name: form.name, role: form.role };
        if (form.password) data.password = form.password;
        await api.put(`/users/${editing.id}`, data);
        toast.success('Пользователь обновлён');
      } else {
        const login = (form.username || '').trim();
        const name = (form.name || '').trim();
        const password = form.password || '';
        if (!login) { toast.error('Укажите логин'); return; }
        if (!password) { toast.error('Укажите пароль'); return; }
        if (!name) { toast.error('Укажите имя'); return; }
        const payload = { email: login, username: login, password, name, role: form.role };
        await api.post('/users', payload);
        toast.success('Пользователь создан');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Деактивировать пользователя?')) return;
    await api.delete(`/users/${id}`);
    toast.success('Пользователь деактивирован');
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Пользователи</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Добавить
        </button>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Логин</th>
              <th>Имя</th>
              <th>Роль</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.name}</td>
                <td>{u.role === 'admin' ? 'Администратор' : 'Кассир'}</td>
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
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Редактировать' : 'Новый пользователь'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            {!editing && (
              <div className="form-group">
                <label className="form-label">Логин</label>
                <input className="form-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Имя</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{editing ? 'Новый пароль (оставьте пустым)' : 'Пароль'}</label>
              <input className="form-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
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
        </div>
      )}
    </div>
  );
}
