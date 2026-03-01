import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { LogIn, CreditCard, X, Building2, Link2, Plus } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import ModalOverlay from '../../components/ModalOverlay';

function defaultPeriodEnd() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

const TABS = [
  { id: 'tenants', label: 'Заведения' },
  { id: 'chains', label: 'Сети' },
];

export default function SuperadminTenants() {
  const [activeTab, setActiveTab] = useState('tenants');
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [chains, setChains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscriptionModal, setSubscriptionModal] = useState(null);
  const [subscriptionPeriodEnd, setSubscriptionPeriodEnd] = useState('');
  const [showChainModal, setShowChainModal] = useState(false);
  const [chainForm, setChainForm] = useState({ name: '', email: '', password: '', owner_name: '' });
  const [chainSaving, setChainSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [t, p, c] = await Promise.all([
        api.get('/superadmin/tenants'),
        api.get('/superadmin/plans'),
        api.get('/superadmin/chains'),
      ]);
      setTenants(t);
      setPlans(p);
      setChains(c);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEnter = async (tenantId) => {
    try {
      const data = await api.post('/superadmin/impersonate', { tenant_id: tenantId });
      useAuthStore.getState().setImpersonation(data.token, data.user, data.tenant);
      window.location.href = '/dashboard';
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleChangePlan = async (tenantId, planId, periodEnd) => {
    try {
      const body = { plan_id: planId };
      if (periodEnd) body.current_period_end = periodEnd;
      await api.put(`/superadmin/tenants/${tenantId}/subscription`, body);
      toast.success('Подписка обновлена');
      setSubscriptionModal(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleCreateChain = async (e) => {
    e.preventDefault();
    setChainSaving(true);
    try {
      await api.post('/superadmin/chains', chainForm);
      toast.success('Сеть создана');
      setShowChainModal(false);
      setChainForm({ name: '', email: '', password: '', owner_name: '' });
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChainSaving(false);
    }
  };

  if (loading) return <div className="spinner" style={{ marginTop: '20vh' }} />;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Управление</h1>
      </div>

      <div className="stats-tabs" style={{ marginBottom: 24 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`stats-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'tenants' && (
        <>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Список заведений и управление подписками</p>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Slug</th>
                  <th>План</th>
                  <th>Статус подписки</th>
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
                      {t.current_period_end && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                          до {new Date(t.current_period_end).toLocaleDateString('ru')}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleEnter(t.id)}
                        >
                          <LogIn size={14} /> Войти
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setSubscriptionModal(t); setSubscriptionPeriodEnd(''); }}
                        >
                          <CreditCard size={14} /> Подписка
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tenants.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                Нет заведений
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'chains' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ color: 'var(--text-muted)' }}>Сети заведений и их владельцы</p>
            <button className="btn btn-primary" onClick={() => setShowChainModal(true)}>
              <Plus size={16} /> Создать сеть
            </button>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Заведений</th>
                  <th>Владелец</th>
                  <th>Email</th>
                  <th>Создана</th>
                </tr>
              </thead>
              <tbody>
                {chains.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link2 size={18} style={{ color: 'var(--text-muted)' }} />
                        {c.name}
                      </span>
                    </td>
                    <td>{c.tenants_count}</td>
                    <td>{c.owner_name || '—'}</td>
                    <td>{c.owner_email || '—'}</td>
                    <td>{new Date(c.created_at).toLocaleDateString('ru')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {chains.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                Нет сетей
              </div>
            )}
          </div>
        </>
      )}

      {subscriptionModal && (
        <ModalOverlay onClose={() => setSubscriptionModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Подписка: {subscriptionModal.name}</h3>
              <button type="button" className="btn-icon" onClick={() => setSubscriptionModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: 16 }}>
              <p style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
                Выберите план
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {plans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn btn-ghost"
                    style={{ justifyContent: 'space-between', textAlign: 'left' }}
                    onClick={() => handleChangePlan(subscriptionModal.id, p.id, subscriptionPeriodEnd || null)}
                  >
                    <span>{p.name}</span>
                    <span>{p.price ? `${p.price} ₽` : 'Бесплатно'}</span>
                  </button>
                ))}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Действует до (необязательно)</label>
                <input
                  type="date"
                  className="form-input"
                  value={subscriptionPeriodEnd || (subscriptionModal.current_period_end ? new Date(subscriptionModal.current_period_end).toISOString().slice(0, 10) : defaultPeriodEnd())}
                  onChange={(e) => setSubscriptionPeriodEnd(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  Если не указать — подписка продлится на 30 дней от текущей даты
                </p>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}

      {showChainModal && (
        <ModalOverlay onClose={() => setShowChainModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 className="modal-title">Создать сеть</h3>
              <button type="button" className="btn-icon" onClick={() => setShowChainModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateChain}>
              <div className="modal-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Название сети</label>
                  <input
                    className="form-input"
                    value={chainForm.name}
                    onChange={(e) => setChainForm({ ...chainForm, name: e.target.value })}
                    placeholder="Сеть «Облако»"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Имя владельца</label>
                  <input
                    className="form-input"
                    value={chainForm.owner_name}
                    onChange={(e) => setChainForm({ ...chainForm, owner_name: e.target.value })}
                    placeholder="Иван Иванов"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email владельца</label>
                  <input
                    className="form-input"
                    type="email"
                    value={chainForm.email}
                    onChange={(e) => setChainForm({ ...chainForm, email: e.target.value })}
                    placeholder="chain@example.com"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Пароль</label>
                  <input
                    className="form-input"
                    type="password"
                    value={chainForm.password}
                    onChange={(e) => setChainForm({ ...chainForm, password: e.target.value })}
                    placeholder="Минимум 6 символов"
                    required
                    minLength={6}
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowChainModal(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary" disabled={chainSaving}>
                  {chainSaving ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
