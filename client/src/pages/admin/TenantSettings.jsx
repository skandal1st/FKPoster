import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

export default function TenantSettings() {
  const { tenant, setTenant } = useAuthStore();
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [accentColor, setAccentColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name || '');
      setLogoUrl(tenant.logo_url || '');
      setAccentColor(tenant.accent_color || '#6366f1');
    }
    api.get('/subscription').then((d) => {
      setSubscription(d.subscription);
      setPlans(d.plans);
    }).catch(() => {});
    // Load usage stats
    Promise.all([
      api.get('/users').then(d => d.length).catch(() => 0),
      api.get('/halls').then(d => d.length).catch(() => 0),
      api.get('/products').then(d => d.length).catch(() => 0),
    ]).then(([users, halls, products]) => {
      setUsage({ users, halls, products });
    });
  }, [tenant]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.put('/tenant', { name, logo_url: logoUrl, accent_color: accentColor });
      setTenant(updated);
      toast.success('Настройки сохранены');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePlan = async (planId) => {
    try {
      await api.post('/subscription/change-plan', { plan_id: planId });
      const d = await api.get('/subscription');
      setSubscription(d.subscription);
      toast.success('План изменён');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Настройки компании</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Основные</h3>
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Название компании</label>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">URL логотипа</label>
              <input className="form-input" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="form-group">
              <label className="form-label">Цвет акцента</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={{ width: 48, height: 36, border: 'none', cursor: 'pointer', background: 'transparent' }}
                />
                <input className="form-input" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ width: 120 }} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Подписка</h3>
          {subscription && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <span className="badge badge-success">{subscription.plan_name}</span>
                <span style={{ marginLeft: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                  {subscription.status === 'trialing' ? 'Пробный период' : subscription.status === 'active' ? 'Активна' : subscription.status}
                </span>
              </div>
              {subscription.current_period_end && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  До {new Date(subscription.current_period_end).toLocaleDateString('ru')}
                </p>
              )}
            </div>
          )}

          {usage && subscription && (
            <div style={{ marginBottom: 16, fontSize: 13 }}>
              <p>Пользователи: {usage.users} / {subscription.max_users}</p>
              <p>Залы: {usage.halls} / {subscription.max_halls}</p>
              <p>Товары: {usage.products} / {subscription.max_products}</p>
            </div>
          )}

          <h4 style={{ marginBottom: 8, fontSize: 14 }}>Доступные планы</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plans.map((plan) => (
              <div key={plan.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)'
              }}>
                <div>
                  <strong>{plan.name}</strong>
                  <span style={{ marginLeft: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                    {plan.price > 0 ? `${plan.price} ₽/мес` : 'Бесплатно'}
                  </span>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {plan.max_users} юзеров, {plan.max_halls} залов, {plan.max_products} товаров
                  </p>
                </div>
                {subscription?.plan_id !== plan.id && (
                  <button className="btn btn-sm btn-ghost" onClick={() => handleChangePlan(plan.id)}>
                    Выбрать
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
