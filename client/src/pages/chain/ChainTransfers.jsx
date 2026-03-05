import { useState, useEffect } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Truck, Check, X, Package, ArrowRight } from 'lucide-react';

const STATUS_LABELS = {
  draft: 'Черновик', approved: 'Одобрен', in_transit: 'В пути',
  completed: 'Завершён', cancelled: 'Отменён', rejected: 'Отклонён',
};
const STATUS_COLORS = {
  draft: 'var(--text-muted)', approved: 'var(--warning)', in_transit: 'var(--accent)',
  completed: 'var(--success)', cancelled: 'var(--danger)', rejected: 'var(--danger)',
};

export default function ChainTransfers() {
  const [transfers, setTransfers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ from_tenant_id: '', to_tenant_id: '', note: '', has_alcohol: false, items: [{ product_name: '', quantity: 1, unit: 'шт', unit_cost: 0 }] });
  const [saving, setSaving] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [t, tn] = await Promise.all([
        api.get('/chain/transfers'),
        api.get('/chain/tenants'),
      ]);
      setTransfers(t);
      setTenants(tn);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { product_name: '', quantity: 1, unit: 'шт', unit_cost: 0 }] });
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  const updateItem = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  };

  const create = async () => {
    if (!form.from_tenant_id || !form.to_tenant_id) return toast.error('Выберите отправителя и получателя');
    if (form.items.some(i => !i.product_name.trim())) return toast.error('Заполните наименования товаров');
    setSaving(true);
    try {
      await api.post('/chain/transfers', {
        ...form,
        from_tenant_id: Number(form.from_tenant_id),
        to_tenant_id: Number(form.to_tenant_id),
        items: form.items.map(i => ({ ...i, quantity: Number(i.quantity), unit_cost: Number(i.unit_cost) })),
      });
      toast.success('Перемещение создано');
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const action = async (id, act) => {
    try {
      await api.post(`/chain/transfers/${id}/${act}`);
      toast.success(act === 'approve' ? 'Одобрено' : act === 'ship' ? 'Отправлено' : act === 'receive' ? 'Получено' : 'Отменено');
      load();
      setSelectedTransfer(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const viewDetails = async (id) => {
    try {
      const data = await api.get(`/chain/transfers/${id}`);
      setSelectedTransfer(data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('ru') : '—';

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Перемещения между заведениями</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Создать перемещение</button>
      </div>

      {transfers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <Truck size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p>Нет перемещений</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Дата</th>
                <th>Откуда</th>
                <th></th>
                <th>Куда</th>
                <th>Алкоголь</th>
                <th>Статус</th>
                <th>Создал</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => viewDetails(t.id)}>
                  <td style={{ fontWeight: 600 }}>{t.transfer_number}</td>
                  <td>{fmt(t.created_at)}</td>
                  <td>{t.from_tenant_name}</td>
                  <td><ArrowRight size={14} style={{ color: 'var(--text-muted)' }} /></td>
                  <td>{t.to_tenant_name}</td>
                  <td>{t.has_alcohol ? 'Да' : '—'}</td>
                  <td>
                    <span style={{ color: STATUS_COLORS[t.status], fontWeight: 600, fontSize: 13 }}>
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                  </td>
                  <td>{t.created_by_name || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      {t.status === 'draft' && <button className="btn btn-ghost btn-sm" onClick={() => action(t.id, 'approve')} title="Одобрить"><Check size={14} /></button>}
                      {t.status === 'approved' && <button className="btn btn-ghost btn-sm" onClick={() => action(t.id, 'ship')} title="Отправить"><Truck size={14} /></button>}
                      {t.status === 'in_transit' && <button className="btn btn-ghost btn-sm" onClick={() => action(t.id, 'receive')} title="Получить"><Package size={14} /></button>}
                      {t.status !== 'completed' && t.status !== 'cancelled' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => action(t.id, 'cancel')} title="Отменить"><X size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Модал создания */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3>Новое перемещение</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Откуда *</label>
                  <select className="form-input" value={form.from_tenant_id} onChange={(e) => setForm({ ...form, from_tenant_id: e.target.value })}>
                    <option value="">Выберите заведение</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Куда *</label>
                  <select className="form-input" value={form.to_tenant_id} onChange={(e) => setForm({ ...form, to_tenant_id: e.target.value })}>
                    <option value="">Выберите заведение</option>
                    {tenants.filter(t => String(t.id) !== String(form.from_tenant_id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.has_alcohol} onChange={(e) => setForm({ ...form, has_alcohol: e.target.checked })} />
                  Содержит алкогольную продукцию (потребуется ТТН ЕГАИС)
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">Примечание</label>
                <input className="form-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>

              <h4 style={{ marginTop: 16, marginBottom: 8 }}>Позиции</h4>
              {form.items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                    {idx === 0 && <label className="form-label">Наименование</label>}
                    <input className="form-input" value={item.product_name} onChange={(e) => updateItem(idx, 'product_name', e.target.value)} placeholder="Товар" />
                  </div>
                  <div className="form-group" style={{ width: 80, marginBottom: 0 }}>
                    {idx === 0 && <label className="form-label">Кол-во</label>}
                    <input className="form-input" type="number" min="0.001" step="0.001" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ width: 70, marginBottom: 0 }}>
                    {idx === 0 && <label className="form-label">Ед.</label>}
                    <input className="form-input" value={item.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ width: 100, marginBottom: 0 }}>
                    {idx === 0 && <label className="form-label">Цена</label>}
                    <input className="form-input" type="number" min="0" step="0.01" value={item.unit_cost} onChange={(e) => updateItem(idx, 'unit_cost', e.target.value)} />
                  </div>
                  {form.items.length > 1 && (
                    <button className="btn-icon" onClick={() => removeItem(idx)} title="Удалить"><X size={14} /></button>
                  )}
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={addItem} style={{ marginTop: 4 }}><Plus size={14} /> Добавить позицию</button>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={create} disabled={saving}>{saving ? 'Создание...' : 'Создать'}</button>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Модал деталей */}
      {selectedTransfer && (
        <div className="modal-overlay" onClick={() => setSelectedTransfer(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>Перемещение {selectedTransfer.transfer_number}</h3>
              <button className="btn-icon" onClick={() => setSelectedTransfer(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14, marginBottom: 16 }}>
                <div><strong>Откуда:</strong> {selectedTransfer.from_tenant_name}</div>
                <div><strong>Куда:</strong> {selectedTransfer.to_tenant_name}</div>
                <div><strong>Статус:</strong> <span style={{ color: STATUS_COLORS[selectedTransfer.status] }}>{STATUS_LABELS[selectedTransfer.status]}</span></div>
                <div><strong>Дата:</strong> {fmt(selectedTransfer.created_at)}</div>
                <div><strong>Алкоголь:</strong> {selectedTransfer.has_alcohol ? 'Да' : 'Нет'}</div>
                <div><strong>Создал:</strong> {selectedTransfer.created_by_name || '—'}</div>
              </div>

              {selectedTransfer.note && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  <strong>Примечание:</strong> {selectedTransfer.note}
                </div>
              )}

              {selectedTransfer.items && selectedTransfer.items.length > 0 && (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr><th>Товар</th><th>Кол-во</th><th>Ед.</th><th>Цена</th><th>Принято</th></tr>
                    </thead>
                    <tbody>
                      {selectedTransfer.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.product_name}</td>
                          <td>{parseFloat(item.quantity)}</td>
                          <td>{item.unit}</td>
                          <td>{item.unit_cost ? parseFloat(item.unit_cost).toLocaleString('ru') + ' ₽' : '—'}</td>
                          <td>{item.received_quantity != null ? parseFloat(item.received_quantity) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {selectedTransfer.status === 'draft' && <button className="btn btn-primary" onClick={() => action(selectedTransfer.id, 'approve')}>Одобрить</button>}
              {selectedTransfer.status === 'approved' && <button className="btn btn-primary" onClick={() => action(selectedTransfer.id, 'ship')}>Отправить</button>}
              {selectedTransfer.status === 'in_transit' && <button className="btn btn-primary" onClick={() => action(selectedTransfer.id, 'receive')}>Подтвердить получение</button>}
              {selectedTransfer.status !== 'completed' && selectedTransfer.status !== 'cancelled' && (
                <button className="btn btn-danger" onClick={() => action(selectedTransfer.id, 'cancel')}>Отменить</button>
              )}
              <button className="btn btn-ghost" onClick={() => setSelectedTransfer(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
