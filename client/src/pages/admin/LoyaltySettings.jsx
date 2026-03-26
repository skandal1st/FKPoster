import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, Gift } from 'lucide-react';
import ModalOverlay from '../../components/ModalOverlay';

const emptyForm = { name: '', min_spent: 0, bonus_rate: 5, sort_order: 0 };

export default function LoyaltySettings() {
  const [tiers, setTiers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      const list = await api.get('/loyalty/tiers');
      setTiers(list);
    } catch {
      toast.error('Не удалось загрузить уровни');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (tier) => {
    setEditing(tier);
    setForm({
      name: tier.name,
      min_spent: tier.min_spent,
      bonus_rate: tier.bonus_rate,
      sort_order: tier.sort_order,
    });
    setShowModal(true);
  };

  const save = async () => {
    try {
      const nameStr = (form.name || '').trim();
      if (!nameStr) { toast.error('Укажите название уровня'); return; }
      const payload = {
        name: nameStr,
        min_spent: parseFloat(form.min_spent) || 0,
        bonus_rate: parseFloat(form.bonus_rate) || 0,
        sort_order: parseInt(form.sort_order) || 0,
      };
      if (editing) {
        await api.put(`/loyalty/tiers/${editing.id}`, payload);
        toast.success('Уровень обновлён');
      } else {
        await api.post('/loyalty/tiers', payload);
        toast.success('Уровень добавлен');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (tier) => {
    if (!confirm(`Удалить уровень «${tier.name}»?`)) return;
    try {
      await api.delete(`/loyalty/tiers/${tier.id}`);
      toast.success('Уровень удалён');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Gift size={22} /> Бонусная программа
          </h2>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Уровни определяются по сумме трат гостя. 1 бонус = 1 ₽.
            Бонусы начисляются с суммы, оплаченной деньгами (после скидки).
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Добавить уровень
        </button>
      </div>

      {tiers.length === 0 ? (
        <div className="pos-notice">
          Уровни не настроены. Добавьте хотя бы один уровень, чтобы включить начисление бонусов.
        </div>
      ) : (
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Название</th>
              <th>Порог трат</th>
              <th>% начисления</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => (
              <tr key={tier.id}>
                <td><strong>{tier.name}</strong></td>
                <td>от {Number(tier.min_spent).toLocaleString('ru')} ₽</td>
                <td>{tier.bonus_rate}%</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-icon" onClick={() => openEdit(tier)} title="Редактировать">
                    <Pencil size={15} />
                  </button>
                  <button className="btn-icon" onClick={() => remove(tier)} title="Удалить" style={{ marginLeft: 4 }}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 20, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)' }}>
        <strong>Как работает:</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li>Гость автоматически попадает на уровень с максимальным подходящим порогом</li>
          <li>При закрытии заказа бонусы начисляются по текущему уровню гостя</li>
          <li>Кассир может списать накопленные бонусы при оплате (1 бонус = 1 ₽)</li>
          <li>Для отдельных гостей можно задать персональный % в настройках гостя</li>
        </ul>
      </div>

      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Редактировать уровень' : 'Новый уровень'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Название *</label>
              <input
                className="form-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Например: Серебро"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Минимальная сумма трат (₽)</label>
              <input
                className="form-input"
                type="number"
                min={0}
                step={1000}
                value={form.min_spent}
                onChange={(e) => setForm({ ...form, min_spent: e.target.value })}
                placeholder="0"
              />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Гость переходит на этот уровень, когда сумма его трат достигает этого значения
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Процент начисления бонусов (%)</label>
              <input
                className="form-input"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={form.bonus_rate}
                onChange={(e) => setForm({ ...form, bonus_rate: e.target.value })}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={save}>Сохранить</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
