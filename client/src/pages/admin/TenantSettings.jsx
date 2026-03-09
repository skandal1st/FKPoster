import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { Link2 } from 'lucide-react';

export default function TenantSettings() {
  const { user, tenant, chain, setTenant } = useAuthStore();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [accentColor, setAccentColor] = useState('#6366f1');
  const [showTableTimer, setShowTableTimer] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);

  // Chain creation
  const [chainName, setChainName] = useState('');
  const [creatingChain, setCreatingChain] = useState(false);

  // Print settings
  const [receiptWidth, setReceiptWidth] = useState('80mm');
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('Спасибо за визит!');
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);
  const [savingPrint, setSavingPrint] = useState(false);

  const [orderUsage, setOrderUsage] = useState(null);

  // Legal entity
  const [legalForm, setLegalForm] = useState({
    legal_name: '', inn: '', kpp: '', ogrn: '',
    legal_address: '', actual_address: '', director_name: '',
    bank_name: '', bank_bik: '', bank_account: '', bank_corr_account: '',
  });
  const [savingLegal, setSavingLegal] = useState(false);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name || '');
      setLogoUrl(tenant.logo_url || '');
      setAccentColor(tenant.accent_color || '#6366f1');
      setShowTableTimer(tenant.show_table_timer !== false);
      setLegalForm({
        legal_name: tenant.legal_name || '',
        inn: tenant.inn || '',
        kpp: tenant.kpp || '',
        ogrn: tenant.ogrn || '',
        legal_address: tenant.legal_address || '',
        actual_address: tenant.actual_address || '',
        director_name: tenant.director_name || '',
        bank_name: tenant.bank_name || '',
        bank_bik: tenant.bank_bik || '',
        bank_account: tenant.bank_account || '',
        bank_corr_account: tenant.bank_corr_account || '',
      });
    }
    api.get('/subscription').then((d) => {
      setSubscription(d.subscription);
      if (d.usage) setOrderUsage(d.usage);
    }).catch(() => {});
    Promise.all([
      api.get('/users').then(d => d.length).catch(() => 0),
      api.get('/halls').then(d => d.length).catch(() => 0),
      api.get('/products').then(d => d.length).catch(() => 0),
    ]).then(([users, halls, products]) => {
      setUsage({ users, halls, products });
    });
    api.get('/tenant/print-settings').then((ps) => {
      setReceiptWidth(ps.receipt_width || '80mm');
      setReceiptHeader(ps.receipt_header || '');
      setReceiptFooter(ps.receipt_footer ?? 'Спасибо за визит!');
      setAutoPrintReceipt(ps.auto_print_receipt || false);
    }).catch(() => {});
  }, [tenant]);

  const handleSavePrint = async (e) => {
    e.preventDefault();
    setSavingPrint(true);
    try {
      await api.put('/tenant/print-settings', {
        receipt_width: receiptWidth,
        receipt_header: receiptHeader,
        receipt_footer: receiptFooter,
        auto_print_receipt: autoPrintReceipt,
      });
      toast.success('Настройки печати сохранены');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPrint(false);
    }
  };

  const handleSaveLegal = async (e) => {
    e.preventDefault();
    setSavingLegal(true);
    try {
      const updated = await api.put('/tenant', legalForm);
      setTenant(updated);
      toast.success('Реквизиты сохранены');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingLegal(false);
    }
  };

  const hasChainFeature = subscription?.features?.chain_management;
  const isOwner = user?.role === 'owner';

  const handleCreateChain = async (e) => {
    e.preventDefault();
    if (!chainName.trim()) return;
    setCreatingChain(true);
    try {
      const data = await api.post('/chain/create', { name: chainName.trim() });
      // Обновляем токен с chain_id
      localStorage.setItem('token', data.token);
      toast.success('Сеть создана! Переходим в управление сетью...');
      // Перезагружаем auth чтобы получить chain
      await useAuthStore.getState().checkAuth();
      navigate('/chain');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingChain(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.put('/tenant', { name, logo_url: logoUrl, accent_color: accentColor, show_table_timer: showTableTimer });
      setTenant(updated);
      toast.success('Настройки сохранены');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
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
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="showTableTimer"
                checked={showTableTimer}
                onChange={(e) => setShowTableTimer(e.target.checked)}
              />
              <label htmlFor="showTableTimer" style={{ cursor: 'pointer' }}>Показывать таймер на занятых столиках</label>
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Тариф</h3>
          {subscription ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 8 }}>
                  <span className="badge badge-success">{subscription.plan_name}</span>
                  <span style={{ marginLeft: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                    {subscription.status === 'trialing' ? 'Пробный период' : subscription.status === 'active' ? 'Активна' : subscription.status}
                  </span>
                </div>
                {subscription.current_period_end && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Действует до {new Date(subscription.current_period_end).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>

              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                <strong style={{ color: 'var(--text-primary)' }}>В тариф входит:</strong>
              </div>
              <ul style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px 20px', padding: 0 }}>
                <li>Пользователей: до {subscription.max_users}</li>
                <li>Залы: до {subscription.max_halls}</li>
                <li>Товары: до {subscription.max_products}</li>
                {subscription.max_orders_monthly && (
                  <li>Заказов в месяц: до {subscription.max_orders_monthly}</li>
                )}
                {(() => {
                  const f = subscription.features;
                  if (f == null) return null;
                  const FEATURE_NAMES = {
                    basic: 'Базовые функции',
                    reports: 'Аналитика и отчёты',
                    inventory: 'Склад',
                    cost_price: 'Себестоимость',
                    api: 'API',
                    chain_management: 'Управление сетью',
                  };
                  if (typeof f === 'object' && Object.keys(f).length > 0) {
                    return Object.entries(f).filter(([, v]) => v).map(([k]) => (
                      <li key={k}>{FEATURE_NAMES[k] || k}</li>
                    ));
                  }
                  return null;
                })()}
              </ul>

              {usage && (
                <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-color)', fontSize: 13, color: 'var(--text-muted)' }}>
                  Использовано: {usage.users} пользователей, {usage.halls} залов, {usage.products} товаров
                </div>
              )}

              {subscription.max_orders_monthly && orderUsage != null && (
                <div style={{ paddingTop: 12, marginTop: 12, borderTop: '1px solid var(--border-color)' }}>
                  {(() => {
                    const used = orderUsage.monthly_orders || 0;
                    const max = subscription.max_orders_monthly;
                    const pct = Math.min(100, Math.round((used / max) * 100));
                    const isDanger = pct >= 80;
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                          <span style={{ color: isDanger ? 'var(--danger)' : 'var(--text-secondary)' }}>
                            Заказов в этом месяце: {used} из {max}
                          </span>
                          <span style={{ color: isDanger ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isDanger ? 700 : 400 }}>
                            {pct}%
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`,
                            height: '100%',
                            borderRadius: 3,
                            background: isDanger ? 'var(--danger)' : 'var(--accent)',
                            transition: 'width 0.3s',
                          }} />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
                Смена тарифа — только через суперадминистратора.
              </p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Нет активной подписки</p>
          )}
        </div>
      </div>

      {isOwner && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Реквизиты юрлица</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Необходимы для формирования УПД, актов и работы с ЭДО.
          </p>
          <form onSubmit={handleSaveLegal}>
            <div className="form-group">
              <label className="form-label">Полное наименование организации</label>
              <input className="form-input" value={legalForm.legal_name} onChange={(e) => setLegalForm({ ...legalForm, legal_name: e.target.value })} placeholder='ООО "Кальянная"' />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">ИНН</label>
                <input className="form-input" value={legalForm.inn} onChange={(e) => setLegalForm({ ...legalForm, inn: e.target.value })} maxLength={12} placeholder="1234567890" />
              </div>
              <div className="form-group">
                <label className="form-label">КПП</label>
                <input className="form-input" value={legalForm.kpp} onChange={(e) => setLegalForm({ ...legalForm, kpp: e.target.value })} maxLength={9} placeholder="123456789" />
              </div>
              <div className="form-group">
                <label className="form-label">ОГРН</label>
                <input className="form-input" value={legalForm.ogrn} onChange={(e) => setLegalForm({ ...legalForm, ogrn: e.target.value })} maxLength={15} placeholder="1234567890123" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Юридический адрес</label>
              <input className="form-input" value={legalForm.legal_address} onChange={(e) => setLegalForm({ ...legalForm, legal_address: e.target.value })} placeholder="г. Москва, ул. Примерная, д. 1" />
            </div>
            <div className="form-group">
              <label className="form-label">Фактический адрес</label>
              <input className="form-input" value={legalForm.actual_address} onChange={(e) => setLegalForm({ ...legalForm, actual_address: e.target.value })} placeholder="г. Москва, ул. Примерная, д. 1" />
            </div>
            <div className="form-group">
              <label className="form-label">Руководитель (ФИО)</label>
              <input className="form-input" value={legalForm.director_name} onChange={(e) => setLegalForm({ ...legalForm, director_name: e.target.value })} placeholder="Иванов Иван Иванович" />
            </div>
            <h4 style={{ marginTop: 16, marginBottom: 12 }}>Банковские реквизиты</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Банк</label>
                <input className="form-input" value={legalForm.bank_name} onChange={(e) => setLegalForm({ ...legalForm, bank_name: e.target.value })} placeholder="ПАО Сбербанк" />
              </div>
              <div className="form-group">
                <label className="form-label">БИК</label>
                <input className="form-input" value={legalForm.bank_bik} onChange={(e) => setLegalForm({ ...legalForm, bank_bik: e.target.value })} maxLength={9} placeholder="044525225" />
              </div>
              <div className="form-group">
                <label className="form-label">Расчётный счёт</label>
                <input className="form-input" value={legalForm.bank_account} onChange={(e) => setLegalForm({ ...legalForm, bank_account: e.target.value })} maxLength={20} placeholder="40702810000000000000" />
              </div>
              <div className="form-group">
                <label className="form-label">Корр. счёт</label>
                <input className="form-input" value={legalForm.bank_corr_account} onChange={(e) => setLegalForm({ ...legalForm, bank_corr_account: e.target.value })} maxLength={20} placeholder="30101810400000000225" />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={savingLegal} style={{ marginTop: 8 }}>
              {savingLegal ? 'Сохранение...' : 'Сохранить реквизиты'}
            </button>
          </form>
        </div>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Настройки печати</h3>
        <form onSubmit={handleSavePrint}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Ширина чека</label>
              <select className="form-input" value={receiptWidth} onChange={(e) => setReceiptWidth(e.target.value)}>
                <option value="80mm">80 мм</option>
                <option value="58mm">58 мм</option>
              </select>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 24 }}>
              <input
                type="checkbox"
                id="autoPrint"
                checked={autoPrintReceipt}
                onChange={(e) => setAutoPrintReceipt(e.target.checked)}
              />
              <label htmlFor="autoPrint" style={{ cursor: 'pointer' }}>Автоматически печатать чек после оплаты</label>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Заголовок чека (название, адрес, ИНН)</label>
            <textarea
              className="form-input"
              value={receiptHeader}
              onChange={(e) => setReceiptHeader(e.target.value)}
              rows={3}
              placeholder="Ваш бар&#10;г. Москва, ул. Примерная, 1&#10;ИНН 1234567890"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Подвал чека</label>
            <input
              className="form-input"
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              placeholder="Спасибо за визит!"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={savingPrint}>
            {savingPrint ? 'Сохранение...' : 'Сохранить настройки печати'}
          </button>
        </form>
      </div>
      {isOwner && hasChainFeature && !chain && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={20} /> Управление сетью
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            На вашем тарифе доступно управление сетью заведений. Создайте сеть, чтобы объединить несколько точек и видеть агрегированную аналитику.
          </p>
          <form onSubmit={handleCreateChain} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Название сети</label>
              <input
                className="form-input"
                value={chainName}
                onChange={(e) => setChainName(e.target.value)}
                placeholder="Моя сеть кальянных"
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={creatingChain}>
              {creatingChain ? 'Создание...' : 'Создать сеть'}
            </button>
          </form>
        </div>
      )}

      {isOwner && chain && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={20} /> Сеть: {chain.name}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Вы являетесь владельцем сети. Перейдите в кабинет сети для управления заведениями и аналитики.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/chain')}>
            Перейти в кабинет сети
          </button>
        </div>
      )}
    </div>
  );
}
