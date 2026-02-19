import { useState, useEffect } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { UserPlus, Copy, Trash2 } from 'lucide-react';

export default function TeamManagement() {
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('cashier');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const data = await api.get('/tenant/users');
      setUsers(data.users);
      setInvitations(data.invitations);
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await api.post('/tenant/invite', { email, role });
      toast.success(`Приглашение создано`);
      setEmail('');
      setShowInvite(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = (token) => {
    const link = `${window.location.origin}/accept-invite?token=${token}`;
    navigator.clipboard.writeText(link);
    toast.success('Ссылка скопирована');
  };

  const roleLabel = (r) => {
    if (r === 'owner') return 'Владелец';
    if (r === 'admin') return 'Админ';
    return 'Кассир';
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Команда</h1>
        <button className="btn btn-primary" onClick={() => setShowInvite(true)}>
          <UserPlus size={16} /> Пригласить
        </button>
      </div>

      {showInvite && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Пригласить пользователя</h3>
          <form onSubmit={handleInvite}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Роль</label>
                <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="cashier">Кассир</option>
                  <option value="admin">Админ</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Отправка...' : 'Пригласить'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowInvite(false)}>Отмена</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Пользователи</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Email</th>
              <th>Роль</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{roleLabel(u.role)}</td>
                <td>
                  <span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`}>
                    {u.active ? 'Активен' : 'Неактивен'}
                  </span>
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
    </div>
  );
}
