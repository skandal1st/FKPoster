import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, AlertTriangle } from 'lucide-react';

export default function Ingredients() {
  const [ingredients, setIngredients] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    category_id: '', name: '', cost_price: '', quantity: '',
    unit: 'г', track_inventory: 1, min_quantity: ''
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [ings, cats] = await Promise.all([api.get('/ingredients'), api.get('/categories')]);
    setIngredients(ings);
    setCategories(cats);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ category_id: categories[0]?.id || '', name: '', cost_price: '', quantity: '', unit: 'г', track_inventory: 1, min_quantity: '' });
    setShowModal(true);
  };

  const openEdit = (ing) => {
    setEditing(ing);
    setForm({
      category_id: ing.category_id, name: ing.name, cost_price: ing.cost_price,
      quantity: ing.quantity, unit: ing.unit, track_inventory: ing.track_inventory,
      min_quantity: ing.min_quantity || ''
    });
    setShowModal(true);
  };

  const save = async () => {
    try {
      const data = { ...form, cost_price: Number(form.cost_price), quantity: Number(form.quantity), min_quantity: Number(form.min_quantity) || 0 };
      if (editing) {
        await api.put(`/ingredients/${editing.id}`, data);
        toast.success('Ингредиент обновлён');
      } else {
        await api.post('/ingredients', data);
        toast.success('Ингредиент создан');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Удалить ингредиент?')) return;
    await api.delete(`/ingredients/${id}`);
    toast.success('Удалено');
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Ингредиенты</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Добавить
        </button>
      </div>

      <div className="card">
        <div style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-muted)' }}>
          Ингредиенты не продаются отдельно, но используются в составе товаров (сиропы, уголь, табак и т.д.)
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Категория</th>
              <th>Себестоимость</th>
              <th>Остаток</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((ing) => (
              <tr key={ing.id}>
                <td>{ing.name}</td>
                <td>
                  <span className="color-dot" style={{ background: ing.category_color, marginRight: 6 }} />
                  {ing.category_name}
                </td>
                <td>{ing.cost_price} ₽</td>
                <td>
                  {ing.track_inventory ? (
                    <>
                      {ing.min_quantity > 0 && ing.quantity <= ing.min_quantity && (
                        <AlertTriangle size={13} style={{ color: 'var(--danger)', marginRight: 4, verticalAlign: 'middle' }} />
                      )}
                      {ing.quantity} {ing.unit}
                    </>
                  ) : '—'}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-icon" onClick={() => openEdit(ing)}><Pencil size={15} /></button>
                  <button className="btn-icon" onClick={() => remove(ing.id)}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ingredients.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет ингредиентов</div>}
      </div>

      {/* Ingredient modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Редактировать' : 'Новый ингредиент'}</h3>
              <button type="button" className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Название</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Категория</label>
              <select className="form-input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Себестоимость</label>
                <input className="form-input" type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Ед. измерения</label>
                <select className="form-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                  <option value="г">г</option>
                  <option value="мл">мл</option>
                  <option value="шт">шт</option>
                  <option value="порц">порц</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Остаток</label>
                <input className="form-input" type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Мин. остаток (порог)</label>
                <input className="form-input" type="number" step="0.01" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">
                <input type="checkbox" checked={form.track_inventory} onChange={(e) => setForm({ ...form, track_inventory: e.target.checked ? 1 : 0 })} /> Учёт остатков
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
              <button type="button" className="btn btn-primary" onClick={save}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
