import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, FlaskConical, AlertTriangle } from 'lucide-react';
import TechCardModal from '../../components/TechCardModal';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [techCardProduct, setTechCardProduct] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    category_id: '', name: '', price: '', cost_price: '', quantity: '',
    unit: 'шт', track_inventory: 1, is_composite: 0, min_quantity: '',
    barcode: '', marking_type: 'none', egais_alcocode: '', tobacco_gtin: ''
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [prods, ings, cats] = await Promise.all([
      api.get('/products'),
      api.get('/ingredients'),
      api.get('/categories')
    ]);
    setProducts(prods);
    setIngredients(ings);
    setCategories(cats);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ category_id: categories[0]?.id || '', name: '', price: '', cost_price: '', quantity: '', unit: 'шт', track_inventory: 1, is_composite: 0, min_quantity: '', barcode: '', marking_type: 'none', egais_alcocode: '', tobacco_gtin: '' });
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      category_id: p.category_id, name: p.name, price: p.price, cost_price: p.cost_price,
      quantity: p.quantity, unit: p.unit, track_inventory: p.track_inventory, is_composite: p.is_composite,
      min_quantity: p.min_quantity || '',
      barcode: p.barcode || '', marking_type: p.marking_type || 'none',
      egais_alcocode: p.egais_alcocode || '', tobacco_gtin: p.tobacco_gtin || ''
    });
    setShowModal(true);
  };

  const save = async () => {
    try {
      const data = { ...form, price: Number(form.price), cost_price: Number(form.cost_price), quantity: Number(form.quantity), min_quantity: Number(form.min_quantity) || 0 };
      if (editing) {
        const updated = await api.put(`/products/${editing.id}`, data);
        toast.success('Товар обновлён');
        setProducts((prev) => prev.map((p) => (p.id === editing.id ? { ...p, ...updated } : p)));
      } else {
        await api.post('/products', data);
        toast.success('Товар создан');
      }
      setShowModal(false);
      if (editing) return;
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Удалить товар?')) return;
    await api.delete(`/products/${id}`);
    toast.success('Удалено');
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Товары</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Добавить
        </button>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Категория</th>
              <th>Цена</th>
              <th>Себест.</th>
              <th>Остаток</th>
              <th>Тип</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>
                  <span className="color-dot" style={{ background: p.category_color, marginRight: 6 }} />
                  {p.category_name}
                </td>
                <td>{p.price} ₽</td>
                <td>{p.cost_price} ₽</td>
                <td>
                  {p.track_inventory ? (
                    <>
                      {p.is_composite && p.available_from_ingredients != null ? (
                        <>
                          {p.min_quantity > 0 && p.available_from_ingredients <= p.min_quantity && (
                            <AlertTriangle size={13} style={{ color: 'var(--danger)', marginRight: 4, verticalAlign: 'middle' }} />
                          )}
                          {p.available_from_ingredients} {p.unit}
                        </>
                      ) : (
                        <>
                          {p.min_quantity > 0 && p.quantity <= p.min_quantity && (
                            <AlertTriangle size={13} style={{ color: 'var(--danger)', marginRight: 4, verticalAlign: 'middle' }} />
                          )}
                          {p.quantity} {p.unit}
                        </>
                      )}
                    </>
                  ) : '—'}
                </td>
                <td>
                  {p.is_composite ? <span className="badge badge-warning">Составной</span> : <span className="badge badge-success">Простой</span>}
                  {p.marking_type === 'egais' && <span className="badge badge-warning" style={{ marginLeft: 4, fontSize: 10 }}>ЕГАИС</span>}
                  {p.marking_type === 'tobacco' && <span className="badge badge-warning" style={{ marginLeft: 4, fontSize: 10 }}>Табак</span>}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn-icon" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTechCardProduct(p); }} title="Техкарта">
                    <FlaskConical size={15} />
                  </button>
                  <button className="btn-icon" onClick={() => openEdit(p)}><Pencil size={15} /></button>
                  <button className="btn-icon" onClick={() => remove(p.id)}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет товаров</div>}
      </div>

      {/* Product modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Редактировать' : 'Новый товар'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
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
                <label className="form-label">Цена</label>
                <input className="form-input" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Себестоимость</label>
                <input className="form-input" type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Остаток</label>
                <input className="form-input" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Ед. измерения</label>
                <select className="form-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                  <option value="шт">шт</option>
                  <option value="г">г</option>
                  <option value="мл">мл</option>
                  <option value="порц">порц</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Мин. остаток (порог)</label>
              <input className="form-input" type="number" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: e.target.value })} placeholder="0" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Штрихкод</label>
                <input className="form-input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="EAN-13 / EAN-8" />
              </div>
              <div className="form-group">
                <label className="form-label">Маркировка</label>
                <select className="form-input" value={form.marking_type} onChange={(e) => setForm({ ...form, marking_type: e.target.value })}>
                  <option value="none">Нет</option>
                  <option value="egais">ЕГАИС (алкоголь)</option>
                  <option value="tobacco">Табак (Честный знак)</option>
                </select>
              </div>
            </div>
            {form.marking_type === 'egais' && (
              <div className="form-group">
                <label className="form-label">Алкокод ЕГАИС</label>
                <input className="form-input" value={form.egais_alcocode} onChange={(e) => setForm({ ...form, egais_alcocode: e.target.value })} placeholder="Код продукции в ЕГАИС" />
              </div>
            )}
            {form.marking_type === 'tobacco' && (
              <div className="form-group">
                <label className="form-label">GTIN табака</label>
                <input className="form-input" value={form.tobacco_gtin} onChange={(e) => setForm({ ...form, tobacco_gtin: e.target.value })} placeholder="14-значный GTIN" maxLength={14} />
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  <input type="checkbox" checked={form.track_inventory} onChange={(e) => setForm({ ...form, track_inventory: e.target.checked ? 1 : 0 })} /> Учёт остатков
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">
                  <input type="checkbox" checked={form.is_composite} onChange={(e) => setForm({ ...form, is_composite: e.target.checked ? 1 : 0 })} /> Составной товар
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={save}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* Tech card modal */}
      {techCardProduct && (
        <TechCardModal
          product={techCardProduct}
          allIngredients={ingredients}
          onClose={() => setTechCardProduct(null)}
          onSaved={() => { setTechCardProduct(null); load(); }}
        />
      )}
    </div>
  );
}
