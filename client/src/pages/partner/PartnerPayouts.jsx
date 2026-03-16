import { useEffect, useState } from 'react';
import { partnerApi } from '../../partnerApi';
import { usePartnerStore } from '../../store/partnerStore';
import ModalOverlay from '../../components/ModalOverlay';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_MAP = {
  pending: { label: 'Ожидает', cls: 'warning' },
  approved: { label: 'Одобрена', cls: 'success' },
  rejected: { label: 'Отклонена', cls: 'danger' },
  paid: { label: 'Оплачено', cls: 'success' },
};

export default function PartnerPayouts() {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const partner = usePartnerStore((s) => s.partner);

  const loadPayouts = () => {
    partnerApi.get('/partner/payouts')
      .then(setPayouts)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPayouts(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error('Укажите сумму');
      return;
    }
    if (!details.trim()) {
      toast.error('Укажите реквизиты');
      return;
    }
    setSaving(true);
    try {
      await partnerApi.post('/partner/payouts', { amount: numAmount, payment_details: details });
      toast.success('Заявка создана');
      setShowModal(false);
      setAmount('');
      setDetails('');
      // Обновить баланс в сторе
      usePartnerStore.getState().checkAuth();
      loadPayouts();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="spinner" style={{ marginTop: '20vh' }} />;

  const balance = partner?.balance || 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Выплаты</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} disabled={balance <= 0}>
          Вывести средства
        </button>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Доступно к выводу</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{balance.toLocaleString('ru')} ₽</div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Реквизиты</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => {
              const st = STATUS_MAP[p.status] || { label: p.status, cls: '' };
              return (
                <tr key={p.id}>
                  <td>{new Date(p.created_at).toLocaleDateString('ru')}</td>
                  <td style={{ fontWeight: 600 }}>{p.amount.toLocaleString('ru')} ₽</td>
                  <td>
                    <span className={`badge badge-${st.cls}`}>{st.label}</span>
                  </td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.payment_details}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.admin_comment || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {payouts.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Нет заявок на вывод
          </div>
        )}
      </div>

      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Вывод средств</h3>
              <button type="button" className="btn-icon" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Сумма (доступно: {balance.toLocaleString('ru')} ₽)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    max={balance}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Реквизиты для выплаты</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Номер карты или реквизиты счёта"
                    required
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Отправка...' : 'Отправить заявку'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
