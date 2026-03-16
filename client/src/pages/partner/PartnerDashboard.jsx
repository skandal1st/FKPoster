import { useEffect, useState } from 'react';
import { partnerApi } from '../../partnerApi';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'lvh.me';

export default function PartnerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    partnerApi.get('/partner/dashboard').then(setData).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);

  const copyToClipboard = async (text, setCopied) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  if (loading) return <div className="spinner" style={{ marginTop: '20vh' }} />;
  if (!data) return null;

  const referralLink = `https://${BASE_DOMAIN}/register?ref=${data.referral_code}`;

  const cards = [
    { label: 'Всего рефералов', value: data.total_referrals },
    { label: 'Активных', value: data.active_referrals },
    { label: 'Баланс', value: `${data.balance.toLocaleString('ru')} ₽` },
    { label: 'Всего заработано', value: `${data.total_earned.toLocaleString('ru')} ₽` },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: 'var(--text-primary)' }}>Дашборд</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        {cards.map((c) => (
          <div key={c.label} className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Ваша реферальная ссылка</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code style={{
            flex: 1, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8,
            fontSize: 14, color: 'var(--text-primary)', wordBreak: 'break-all',
          }}>
            {referralLink}
          </code>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => copyToClipboard(referralLink, setCopiedLink)}
            style={{ flexShrink: 0 }}
          >
            {copiedLink ? <Check size={16} /> : <Copy size={16} />}
            {copiedLink ? 'Скопировано' : 'Копировать'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 32 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Ваш промокод</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code style={{
            padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8,
            fontSize: 18, fontWeight: 700, letterSpacing: 2, color: 'var(--accent)',
          }}>
            {data.referral_code}
          </code>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => copyToClipboard(data.referral_code, setCopiedCode)}
          >
            {copiedCode ? <Check size={16} /> : <Copy size={16} />}
            {copiedCode ? 'Скопировано' : 'Копировать'}
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>
          Клиент вводит промокод при регистрации и получает бесплатный месяц на максимальном тарифе. Вы получаете 30% от их оплат.
        </p>
      </div>

      {data.recent_commissions.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Последние начисления</h2>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>План</th>
                  <th>Цена плана</th>
                  <th>Комиссия</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_commissions.map((c, i) => (
                  <tr key={i}>
                    <td>{c.tenant_name}</td>
                    <td>{c.plan_name}</td>
                    <td>{c.plan_price.toLocaleString('ru')} ₽</td>
                    <td style={{ color: 'var(--success)', fontWeight: 600 }}>+{c.commission_amount.toLocaleString('ru')} ₽</td>
                    <td>{new Date(c.created_at).toLocaleDateString('ru')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
