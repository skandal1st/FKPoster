import { useState, useEffect } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, X, Search } from 'lucide-react';

export default function Counterparties() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', inn: '', kpp: '', legal_address: '', edo_id: '', egais_fsrar_id: '', phone: '', email: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [searchInn, setSearchInn] = useState('');
  const [edoResults, setEdoResults] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await api.get('/counterparties');
      setList(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', inn: '', kpp: '', legal_address: '', edo_id: '', egais_fsrar_id: '', phone: '', email: '', note: '' });
    setEdoResults(null);
    setShowModal(true);
  };

  const openEdit = (cp) => {
    setEditing(cp);
    setForm({
      name: cp.name || '', inn: cp.inn || '', kpp: cp.kpp || '',
      legal_address: cp.legal_address || '', edo_id: cp.edo_id || '',
      egais_fsrar_id: cp.egais_fsrar_id || '', phone: cp.phone || '',
      email: cp.email || '', note: cp.note || '',
    });
    setEdoResults(null);
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Укажите наименование');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/counterparties/${editing.id}`, form);
        toast.success('Контрагент обновлён');
      } else {
        await api.post('/counterparties', form);
        toast.success('Контрагент создан');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Деактивировать контрагента?')) return;
    try {
      await api.delete(`/counterparties/${id}`);
      toast.success('Контрагент деактивирован');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const searchEdo = async () => {
    if (!searchInn || searchInn.length < 10) return toast.error('Введите ИНН (10-12 цифр)');
    try {
      const results = await api.get(`/counterparties/search-edo?inn=${searchInn}`);
      setEdoResults(results);
      if (results.length === 0) toast('Контрагент не найден в ЭДО', { icon: 'ℹ' });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const applyEdoResult = (r) => {
    setForm((f) => ({ ...f, name: r.name || f.name, inn: r.inn || f.inn, kpp: r.kpp || f.kpp, edo_id: r.edoId || f.edo_id }));
    setEdoResults(null);
    toast.success('Данные заполнены из ЭДО');
  };

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Контрагенты</h1>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Добавить</button>
      </div>

      {list.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <p>Нет контрагентов</p>
          <p style={{ fontSize: 13 }}>Добавьте поставщиков для работы с ЭДО и приёмкой</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Наименование</th>
                <th>ИНН</th>
                <th>КПП</th>
                <th>Телефон</th>
                <th>Email</th>
                <th>ФСРАР</th>
                <th>ЭДО ID</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.filter(c => c.is_active).map((cp) => (
                <tr key={cp.id}>
                  <td style={{ fontWeight: 600 }}>{cp.name}</td>
                  <td>{cp.inn || '—'}</td>
                  <td>{cp.kpp || '—'}</td>
                  <td>{cp.phone || '—'}</td>
                  <td>{cp.email || '—'}</td>
                  <td>{cp.egais_fsrar_id || '—'}</td>
                  <td style={{ fontSize: 12, color: cp.edo_id ? 'var(--success)' : 'var(--text-muted)' }}>
                    {cp.edo_id ? 'Есть' : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-icon" onClick={() => openEdit(cp)} title="Редактировать"><Edit2 size={14} /></button>
                      <button className="btn-icon" onClick={() => remove(cp.id)} title="Деактивировать"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>{editing ? 'Редактирование контрагента' : 'Новый контрагент'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">Поиск в ЭДО по ИНН</label>
                  <input className="form-input" value={searchInn} onChange={(e) => setSearchInn(e.target.value)} placeholder="ИНН контрагента" />
                </div>
                <button className="btn btn-ghost btn-sm" onClick={searchEdo}><Search size={14} /> Найти</button>
              </div>
              {edoResults && edoResults.length > 0 && (
                <div style={{ marginBottom: 16, border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
                  {edoResults.map((r, i) => (
                    <div key={i} style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
                      <div><strong>{r.name}</strong><br /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ИНН: {r.inn} КПП: {r.kpp}</span></div>
                      <button className="btn btn-ghost btn-sm" onClick={() => applyEdoResult(r)}>Выбрать</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Наименование *</label>
                <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">ИНН</label>
                  <input className="form-input" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} maxLength={12} />
                </div>
                <div className="form-group">
                  <label className="form-label">КПП</label>
                  <input className="form-input" value={form.kpp} onChange={(e) => setForm({ ...form, kpp: e.target.value })} maxLength={9} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Юридический адрес</label>
                <input className="form-input" value={form.legal_address} onChange={(e) => setForm({ ...form, legal_address: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Телефон</label>
                  <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">ФСРАР ИД</label>
                  <input className="form-input" value={form.egais_fsrar_id} onChange={(e) => setForm({ ...form, egais_fsrar_id: e.target.value })} placeholder="Для поставщиков алкоголя" />
                </div>
                <div className="form-group">
                  <label className="form-label">ЭДО ID</label>
                  <input className="form-input" value={form.edo_id} onChange={(e) => setForm({ ...form, edo_id: e.target.value })} placeholder="Идентификатор в ЭДО" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Примечание</label>
                <textarea className="form-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
