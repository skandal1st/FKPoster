import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X } from 'lucide-react';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#6366f1', sort_order: 0 });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setCategories(await api.get('/categories'));
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', color: '#6366f1', sort_order: 0 });
    setShowModal(true);
  };

  const openEdit = (cat) => {
    setEditing(cat);
    setForm({ name: cat.name, color: cat.color, sort_order: cat.sort_order });
    setShowModal(true);
  };

  const save = async () => {
    try {
      if (editing) {
        await api.put(`/categories/${editing.id}`, form);
        toast.success('Категория обновлена');
      } else {
        await api.post('/categories', form);
        toast.success('Категория создана');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Удалить категорию?')) return;
    await api.delete(`/categories/${id}`);
    toast.success('Удалено');
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Категории</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Добавить
        </button>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Цвет</th>
              <th>Название</th>
              <th>Порядок</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id}>
                <td><span className="color-dot" style={{ background: cat.color }} /></td>
                <td>{cat.name}</td>
                <td>{cat.sort_order}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-icon" onClick={() => openEdit(cat)}><Pencil size={15} /></button>
                  <button className="btn-icon" onClick={() => remove(cat.id)}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {categories.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет категорий</div>}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Редактировать' : 'Новая категория'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Название</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Цвет</label>
                <input type="color" className="form-input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ height: 40, padding: 4 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Порядок</label>
                <input className="form-input" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={save}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
