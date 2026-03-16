import { useEffect, useState } from 'react';
import { partnerApi } from '../../partnerApi';
import toast from 'react-hot-toast';

export default function PartnerReferrals() {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    partnerApi.get('/partner/referrals')
      .then(setReferrals)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="spinner" style={{ marginTop: '20vh' }} />;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: 'var(--text-primary)' }}>Рефералы</h1>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Название компании</th>
              <th>Дата регистрации</th>
              <th>Текущий план</th>
              <th>Статус подписки</th>
              <th>Комиссия с клиента</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.tenant_name}</td>
                <td>{new Date(r.created_at).toLocaleDateString('ru')}</td>
                <td>{r.plan_name || '—'}</td>
                <td>
                  {r.subscription_status ? (
                    <span className={`badge badge-${r.subscription_status === 'active' ? 'success' : 'warning'}`}>
                      {r.subscription_status === 'active' ? 'Активна' : 'Пробный'}
                    </span>
                  ) : (
                    <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>Нет</span>
                  )}
                </td>
                <td style={{ fontWeight: 600, color: r.total_commission > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                  {r.total_commission > 0 ? `${r.total_commission.toLocaleString('ru')} ₽` : '0 ₽'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {referrals.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Пока нет привлечённых клиентов. Поделитесь своей реферальной ссылкой!
          </div>
        )}
      </div>
    </div>
  );
}
