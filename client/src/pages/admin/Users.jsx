import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, UserPlus, Copy } from 'lucide-react';

const roleLabel = (r) => {
  if (r === 'owner') return 'Владелец';
  if (r === 'admin') return 'Администратор';
  return 'Кассир';
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'cashier' });
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('cashier');
  const [inviteLoading, setInviteLoading] = useState(false);

  const load = async () => {
    const [usersList, tenantData] = await Promise.all([
      api.get('/users'),
      api.get('/tenant/users').catch(() => ({ users: [], invitations: [] }))
    ]);
    setUsers(usersList);
    setInvitations(tenantData.invitations || []);
  };

  useEffect(() => { load(); }, []);

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

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteLoading(true);
    try {
      await api.post('/tenant/invite', { email: inviteEmail, role: inviteRole });
      toast.success('Приглашение отправлено');
      setInviteEmail('');
      setShowInvite(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const copyInviteLink = (token) => {
    const link = `${window.location.origin}/accept-invite?token=${token}`;
    navigator.clipboard.writeText(link);
    toast.success('Ссылка скопирована');
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Пользователи</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowInvite(!showInvite)}>
            <UserPlus size={16} /> Пригласить
          </button>
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={16} /> Добавить
          </button>
        </div>
      </div>

      {showInvite && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Пригласить по email</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Отправьте ссылку — пользователь сам задаст пароль при переходе.
          </p>
          <form onSubmit={handleInvite} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                required
                style={{ minWidth: 200 }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Роль</label>
              <select className="form-input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="cashier">Кассир</option>
                <option value="admin">Администратор</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit" disabled={inviteLoading}>
              {inviteLoading ? 'Отправка...' : 'Пригласить'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => { setShowInvite(false); setInviteEmail(''); }}>
              Отмена
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Сотрудники</h3>
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
                <td>{roleLabel(u.role)}</td>
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

      {invitations.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Приглашения</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Истекает</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.email}</td>
                  <td>{roleLabel(inv.role)}</td>
                  <td>
                    <span className={`badge ${inv.accepted ? 'badge-success' : 'badge-warning'}`}>
                      {inv.accepted ? 'Принято' : 'Ожидает'}
                    </span>
                  </td>
                  <td style={{ fontSize: 13 }}>{new Date(inv.expires_at).toLocaleDateString('ru')}</td>
                  <td>
                    {!inv.accepted && (
                      <button className="btn-icon" onClick={() => copyInviteLink(inv.token)} title="Скопировать ссылку">
                        <Copy size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
