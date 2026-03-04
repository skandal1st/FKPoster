import { useEffect, useState, useRef } from 'react';
import { api } from '../../api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { LogIn, Plus, Unlink, X, Building2, Search, Link2 } from 'lucide-react';
import ModalOverlay from '../../components/ModalOverlay';

export default function ChainTenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);

  // Search state for linking existing tenants
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

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
      useAuthStore.getState().setChainImpersonation(res.token, res.user, res.tenant, res.plan);
      window.location.href = '/dashboard';
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
      setShowCreateModal(false);
      setForm({ name: '', email: '', password: '' });
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Search for existing tenants
  const handleSearch = (q) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.get(`/chain/tenants/search?q=${encodeURIComponent(q)}`);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleLinkTenant = async (tenantId) => {
    try {
      await api.post('/chain/tenants/link', { tenant_id: tenantId });
      toast.success('Заведение добавлено в сеть');
      setSearchResults((prev) => prev.filter((t) => t.id !== tenantId));
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) return <div className="spinner" style={{ marginTop: '20vh' }} />;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Заведения сети</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => { setShowLinkModal(true); setSearchQuery(''); setSearchResults([]); }}>
            <Link2 size={16} /> Добавить существующее
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Создать новое
          </button>
        </div>
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

      {/* Модалка: создать новое заведение */}
      {showCreateModal && (
        <ModalOverlay onClose={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 className="modal-title">Создать заведение</h3>
              <button type="button" className="btn-icon" onClick={() => setShowCreateModal(false)}>
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
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* Модалка: добавить существующее заведение */}
      {showLinkModal && (
        <ModalOverlay onClose={() => setShowLinkModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Добавить существующее заведение</h3>
              <button type="button" className="btn-icon" onClick={() => setShowLinkModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: 16 }}>
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Поиск по названию или slug</label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    className="form-input"
                    style={{ paddingLeft: 36 }}
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Введите название или slug..."
                    autoFocus
                  />
                </div>
              </div>

              {searching && <div className="spinner" style={{ margin: '20px auto' }} />}

              {!searching && searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {searchResults.map((t) => (
                    <div key={t.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8,
                    }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.slug}</div>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={() => handleLinkTenant(t.id)}>
                        <Plus size={14} /> Добавить
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Заведения не найдены
                </div>
              )}

              {searchQuery.length < 2 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                  Введите минимум 2 символа для поиска
                </p>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
