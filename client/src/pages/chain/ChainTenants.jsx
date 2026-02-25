import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { LogIn, Plus, Unlink, X, Building2 } from 'lucide-react';

export default function ChainTenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get('/chain/tenants')
      .then(setTenants)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleEnter = async (tenantId) => {
    try {
      const res = await api.post('/chain/impersonate', { tenant_id: tenantId });
      useAuthStore.getState().setChainImpersonation(res.token, res.user, res.tenant);
      window.location.href = '/';
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleUnlink = async (tenantId, tenantName) => {
    if (!confirm(`Отвязать заведение "${tenantName}" от сети?`)) return;
    try {
      await api.delete(`/chain/tenants/${tenantId}`);
      toast.success('Заведение отвязано');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/chain/tenants', form);
      toast.success('Заведение создано');
      setShowModal(false);
      setForm({ name: '', email: '', password: '' });
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="spinner" style={{ marginTop: '20vh' }} />;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Заведения сети</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Создать заведение
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Slug</th>
              <th>План</th>
              <th>Подписка</th>
              <th>Выручка сегодня</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building2 size={18} style={{ color: 'var(--text-muted)' }} />
                    {t.name}
                  </span>
                </td>
                <td><code style={{ fontSize: 13 }}>{t.slug}</code></td>
                <td>{t.plan_name || '—'}</td>
                <td>
                  {t.subscription_status ? (
                    <span className={`badge badge-${t.subscription_status === 'active' ? 'success' : 'warning'}`}>
                      {t.subscription_status === 'active' ? 'Активна' : 'Пробный'}
                    </span>
                  ) : (
                    <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>Нет</span>
                  )}
                </td>
                <td>{Math.round(parseFloat(t.today_revenue) || 0).toLocaleString()} ₽</td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => handleEnter(t.id)}>
                      <LogIn size={14} /> Войти
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleUnlink(t.id, t.name)}>
                      <Unlink size={14} /> Отвязать
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tenants.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Нет заведений в сети
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 className="modal-title">Создать заведение</h3>
              <button type="button" className="btn-icon" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Название заведения</label>
                  <input
                    className="form-input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Кальянная Облако"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email владельца</label>
                  <input
                    className="form-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="owner@example.com"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Пароль владельца</label>
                  <input
                    className="form-input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Минимум 6 символов"
                    required
                    minLength={6}
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
