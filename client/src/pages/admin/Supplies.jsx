import { useEffect, useState, useMemo } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, X, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { exportToCsv } from '../../utils/exportCsv';

export default function Supplies() {
  const [supplies, setSupplies] = useState([]);
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ supplier: '', note: '', items: [] });
  const [openDropdownIdx, setOpenDropdownIdx] = useState(null);

  const supplyOptions = useMemo(() => {
    const prods = (products || []).map((p) => ({ ...p, _type: 'product' }));
    const ings = (ingredients || []).map((p) => ({ ...p, _type: 'ingredient' }));
    return [...prods, ...ings].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, ingredients]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [s, p, ing] = await Promise.all([
      api.get('/supplies'),
      api.get('/products'),
      api.get('/ingredients').catch(() => [])
    ]);
    setSupplies(s);
    setProducts(p || []);
    setIngredients(ing || []);
  };

  const openNew = () => {
    setForm({
      supplier: '',
      note: '',
      items: [{ product_id: '', quantity: '', unit_cost: '', searchText: '' }]
    });
    setOpenDropdownIdx(null);
    setShowModal(true);
  };

  const addRow = () => {
    setForm({
      ...form,
      items: [...form.items, { product_id: '', quantity: '', unit_cost: '', searchText: '' }]
    });
  };

  const updateRow = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    if (field === 'searchText') {
      setOpenDropdownIdx(idx);
      items[idx].product_id = ''; // сброс выбора при наборе текста
    }
    setForm({ ...form, items });
  };

  const selectOption = (idx, option) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], product_id: option.id, searchText: '' };
    setForm({ ...form, items });
    setOpenDropdownIdx(null);
  };

  const getOptionName = (id) => {
    const opt = supplyOptions.find((o) => o.id === id);
    return opt ? opt.name : '';
  };

  const getFilteredOptions = (idx) => {
    const item = form.items[idx];
    const q = (item.searchText || '').trim().toLowerCase();
    if (!q) return supplyOptions;
    return supplyOptions.filter(
      (o) => o.name.toLowerCase().includes(q)
    );
  };

  const removeRow = (idx) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  };

  const save = async () => {
    try {
      const items = form.items
        .filter((i) => i.product_id && i.quantity && i.unit_cost)
        .map((i) => ({
          product_id: Number(i.product_id),
          quantity: Number(i.quantity),
          unit_cost: Number(i.unit_cost)
        }));
      if (items.length === 0) {
        toast.error('Добавьте хотя бы одну позицию');
        return;
      }
      await api.post('/supplies', { supplier: form.supplier, note: form.note, items });
      toast.success('Поставка оформлена');
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const totalForm = form.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Поставки</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => {
            const headers = ['#', 'Дата', 'Поставщик', 'Товар', 'Кол-во', 'Ед.', 'Цена за ед.', 'Сумма'];
            const rows = [];
            for (const s of supplies) {
              if (s.items) {
                for (const item of s.items) {
                  rows.push([s.id, new Date(s.created_at).toLocaleDateString('ru'), s.supplier || '', item.product_name, item.quantity, item.unit, item.unit_cost, (item.quantity * item.unit_cost).toFixed(0)]);
                }
              }
            }
            exportToCsv('supplies.csv', headers, rows);
          }}>
            <Download size={16} /> CSV
          </button>
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={16} /> Новая поставка
          </button>
        </div>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>#</th>
              <th>Дата</th>
              <th>Поставщик</th>
              <th>Сумма</th>
              <th>Кто принял</th>
            </tr>
          </thead>
          <tbody>
            {supplies.map((s) => (
              <>
                <tr key={s.id} onClick={() => setExpanded(expanded === s.id ? null : s.id)} style={{ cursor: 'pointer' }}>
                  <td>{expanded === s.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                  <td>{s.id}</td>
                  <td>{new Date(s.created_at).toLocaleDateString('ru')}</td>
                  <td>{s.supplier || '—'}</td>
                  <td>{s.total} ₽</td>
                  <td>{s.user_name || '—'}</td>
                </tr>
                {expanded === s.id && s.items?.map((item) => (
                  <tr key={`${s.id}-${item.id}`} style={{ background: 'var(--bg-tertiary)' }}>
                    <td></td>
                    <td colSpan={2}>{item.product_name}</td>
                    <td>{item.quantity} {item.unit}</td>
                    <td>{item.unit_cost} ₽/ед</td>
                    <td>{(item.quantity * item.unit_cost).toFixed(0)} ₽</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
        {supplies.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет поставок</div>}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3 className="modal-title">Новая поставка</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Поставщик</label>
                <input className="form-input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Примечание</label>
                <input className="form-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>

            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Позиции</div>
            {form.items.map((item, idx) => (
              <div key={idx} className="form-row" style={{ marginBottom: 8, alignItems: 'end' }}>
                <div className="form-group" style={{ flex: 2, position: 'relative' }}>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Начните вводить товар или ингредиент..."
                    value={item.product_id ? getOptionName(item.product_id) : (item.searchText || '')}
                    onChange={(e) => updateRow(idx, 'searchText', e.target.value)}
                    onFocus={() => setOpenDropdownIdx(idx)}
                    onBlur={() => setTimeout(() => setOpenDropdownIdx(null), 150)}
                  />
                  {openDropdownIdx === idx && (
                    <ul
                      className="supply-position-dropdown"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '100%',
                        margin: 0,
                        padding: 0,
                        listStyle: 'none',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        maxHeight: 220,
                        overflowY: 'auto',
                        zIndex: 100
                      }}
                    >
                      {getFilteredOptions(idx).length === 0 ? (
                        <li style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 13 }}>Ничего не найдено</li>
                      ) : (
                        getFilteredOptions(idx).map((opt) => (
                          <li
                            key={opt.id}
                            style={{
                              padding: '10px 12px',
                              cursor: 'pointer',
                              fontSize: 14,
                              borderBottom: '1px solid var(--border-color)'
                            }}
                            onMouseDown={(e) => { e.preventDefault(); selectOption(idx, opt); }}
                          >
                            {opt.name}
                            <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>({opt.unit})</span>
                            {opt._type === 'ingredient' && (
                              <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)' }}>ингр.</span>
                            )}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
                <div className="form-group">
                  <input className="form-input" type="number" placeholder="Кол-во" value={item.quantity} onChange={(e) => updateRow(idx, 'quantity', e.target.value)} />
                </div>
                <div className="form-group">
                  <input className="form-input" type="number" placeholder="Цена за ед." value={item.unit_cost} onChange={(e) => updateRow(idx, 'unit_cost', e.target.value)} />
                </div>
                <button type="button" className="btn-icon" onClick={() => removeRow(idx)} style={{ marginBottom: 16 }}>
                  <X size={14} />
                </button>
              </div>
            ))}

            <button className="btn btn-ghost btn-sm" onClick={addRow} style={{ marginBottom: 16 }}>
              <Plus size={14} /> Добавить позицию
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Итого: {totalForm.toFixed(0)} ₽</div>
              <div className="modal-actions" style={{ margin: 0 }}>
                <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
                <button className="btn btn-primary" onClick={save}>Оформить</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
