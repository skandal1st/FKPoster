import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { LogIn, CreditCard, X, Building2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function SuperadminTenants() {
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscriptionModal, setSubscriptionModal] = useState(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [t, p] = await Promise.all([api.get('/superadmin/tenants'), api.get('/superadmin/plans')]);
      setTenants(t);
      setPlans(p);
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
      window.location.href = '/';
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleChangePlan = async (tenantId, planId) => {
    try {
      await api.put(`/superadmin/tenants/${tenantId}/subscription`, { plan_id: planId });
      toast.success('Подписка обновлена');
      setSubscriptionModal(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) return <div className="spinner" style={{ marginTop: '20vh' }} />;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Заведения</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Список заведений и управление подписками</p>
      </div>

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
                      onClick={() => setSubscriptionModal(t)}
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

      {subscriptionModal && (
        <div className="modal-overlay" onClick={() => setSubscriptionModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn btn-ghost"
                    style={{ justifyContent: 'space-between', textAlign: 'left' }}
                    onClick={() => handleChangePlan(subscriptionModal.id, p.id)}
                  >
                    <span>{p.name}</span>
                    <span>{p.price ? `${p.price} ₽` : 'Бесплатно'}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
