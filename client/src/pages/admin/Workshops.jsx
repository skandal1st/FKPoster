import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import ModalOverlay from '../../components/ModalOverlay';

export default function Workshops() {
  const [workshops, setWorkshops] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setWorkshops(await api.get('/workshops'));
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: '' });
    setShowModal(true);
  };

  const openEdit = (ws) => {
    setEditing(ws);
    setForm({ name: ws.name });
    setShowModal(true);
  };

  const save = async () => {
    try {
      if (editing) {
        await api.put(`/workshops/${editing.id}`, form);
        toast.success('Цех обновлён');
      } else {
        await api.post('/workshops', form);
        toast.success('Цех создан');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Удалить цех? Категории будут откреплены.')) return;
    await api.delete(`/workshops/${id}`);
    toast.success('Удалено');
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Цеха</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Добавить
        </button>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Категорий</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {workshops.map((ws) => (
              <tr key={ws.id}>
                <td>{ws.name}</td>
                <td>{ws.category_count}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-icon" onClick={() => openEdit(ws)}><Pencil size={15} /></button>
                  <button className="btn-icon" onClick={() => remove(ws.id)}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {workshops.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет цехов</div>}
      </div>

      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Редактировать цех' : 'Новый цех'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Название</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
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
