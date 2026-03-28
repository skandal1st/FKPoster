import { useEffect, useState, useMemo } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, X, ChevronDown, ChevronRight, Download, ScanBarcode, Trash2 } from 'lucide-react';
import { exportToCsv } from '../../utils/exportCsv';
import MarkingScanner from '../../components/MarkingScanner';
import ModalOverlay from '../../components/ModalOverlay';
import TabNav from '../../components/TabNav';
import { STOCK_TABS } from '../../constants/tabGroups';

export default function Supplies() {
  const [supplies, setSupplies] = useState([]);
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ supplier: '', note: '', items: [] });
  const [openDropdownIdx, setOpenDropdownIdx] = useState(null);
  const [scanSupply, setScanSupply] = useState(null);

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

  const newRow = () => ({ product_id: '', quantity: '', unit_cost: '', searchText: '', mode: 'unit', package_size: '', package_price: '', package_qty: '' });

  const openNew = () => {
    setForm({
      supplier: '',
      note: '',
      items: [newRow()]
    });
    setOpenDropdownIdx(null);
    setShowModal(true);
  };

  const addRow = () => {
    setForm({
      ...form,
      items: [...form.items, newRow()]
    });
  };

  const updateRow = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    if (field === 'searchText') {
      setOpenDropdownIdx(idx);
      items[idx].product_id = '';
    }
    // В режиме фасовки — пересчитываем unit_cost
    if (['package_price', 'package_size'].includes(field)) {
      const row = items[idx];
      const price = parseFloat(field === 'package_price' ? value : row.package_price) || 0;
      const size = parseFloat(field === 'package_size' ? value : row.package_size) || 0;
      items[idx].unit_cost = size > 0 ? (price / size).toFixed(4) : '';
    }
    setForm({ ...form, items });
  };

  const toggleMode = (idx) => {
    const items = [...form.items];
    const row = items[idx];
    const newMode = row.mode === 'unit' ? 'package' : 'unit';
    items[idx] = { ...row, mode: newMode, quantity: '', unit_cost: '', package_size: '', package_price: '', package_qty: '' };
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

  const deleteSupply = async (id) => {
    if (!confirm('Удалить поставку? Остатки и себестоимость будут пересчитаны.')) return;
    try {
      await api.delete(`/supplies/${id}`);
      toast.success('Поставка удалена');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const save = async () => {
    try {
      const items = form.items
        .filter((i) => {
          if (!i.product_id) return false;
          if (i.mode === 'package') return i.package_qty && i.package_size && i.package_price;
          return i.quantity && i.unit_cost;
        })
        .map((i) => {
          if (i.mode === 'package') {
            const pkgSize = parseFloat(i.package_size);
            const pkgPrice = parseFloat(i.package_price);
            const pkgQty = parseFloat(i.package_qty);
            return {
              product_id: Number(i.product_id),
              quantity: pkgQty * pkgSize,
              unit_cost: pkgPrice / pkgSize,
              package_size: pkgSize,
              package_price: pkgPrice,
              package_qty: pkgQty
            };
          }
          return {
            product_id: Number(i.product_id),
            quantity: Number(i.quantity),
            unit_cost: Number(i.unit_cost)
          };
        });
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

  const totalForm = form.items.reduce((s, i) => {
    if (i.mode === 'package') {
      return s + (parseFloat(i.package_qty) || 0) * (parseFloat(i.package_price) || 0);
    }
    return s + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0);
  }, 0);

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
      <TabNav tabs={STOCK_TABS} />

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
              <th></th>
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
                  <td>
                    <button
                      className="btn-icon"
                      title="Удалить поставку"
                      onClick={(e) => { e.stopPropagation(); deleteSupply(s.id); }}
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
                {expanded === s.id && s.items?.map((item) => (
                  <tr key={`${s.id}-${item.id}`} style={{ background: 'var(--bg-tertiary)' }}>
                    <td></td>
                    <td colSpan={2}>
                      {item.product_name}
                      {item.marking_type && item.marking_type !== 'none' && (
                        <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: 10 }}>
                          {item.marking_type === 'egais' ? 'ЕГАИС' : 'Табак'}
                        </span>
                      )}
                    </td>
                    <td>
                      {item.package_qty && item.package_size
                        ? <>{item.package_qty} уп. × {item.package_size} {item.unit} = {item.quantity} {item.unit}</>
                        : <>{item.quantity} {item.unit}</>}
                    </td>
                    <td>
                      {item.package_size && item.package_price
                        ? <>{item.package_price} ₽/уп. ({parseFloat(item.unit_cost).toFixed(2)} ₽/{item.unit})</>
                        : <>{item.unit_cost} ₽/{item.unit}</>}
                    </td>
                    <td>{(item.quantity * item.unit_cost).toFixed(0)} ₽</td>
                  </tr>
                ))}
                {expanded === s.id && s.items?.some((i) => i.marking_type && i.marking_type !== 'none') && (
                  <tr key={`${s.id}-scan`} style={{ background: 'var(--bg-tertiary)' }}>
                    <td colSpan={6} style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => { e.stopPropagation(); setScanSupply(s); }}
                        style={{ color: 'var(--accent)' }}
                      >
                        <ScanBarcode size={14} /> Сканировать маркировку
                      </button>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {supplies.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет поставок</div>}
      </div>

      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
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
            {form.items.map((item, idx) => {
              const selectedOpt = supplyOptions.find((o) => o.id === item.product_id);
              const unitLabel = selectedOpt?.unit || 'ед';
              const isPackage = item.mode === 'package';
              const calcUnitCost = isPackage && parseFloat(item.package_size) > 0
                ? (parseFloat(item.package_price) || 0) / parseFloat(item.package_size)
                : null;
              return (
                <div key={idx} style={{ marginBottom: 12, border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: 2, marginBottom: 0, position: 'relative' }}>
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
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleMode(idx)}
                      style={{ whiteSpace: 'nowrap', marginBottom: 0 }}
                      title="Переключить режим ввода"
                    >
                      {isPackage ? 'По фасовке' : 'По ед.'}
                    </button>
                    <button type="button" className="btn-icon" onClick={() => removeRow(idx)} style={{ marginBottom: 0 }}>
                      <X size={14} />
                    </button>
                  </div>

                  {isPackage ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Кол-во упаковок</label>
                        <input className="form-input" type="number" placeholder="напр. 10" value={item.package_qty} onChange={(e) => updateRow(idx, 'package_qty', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Фасовка ({unitLabel})</label>
                        <input className="form-input" type="number" placeholder="напр. 200" value={item.package_size} onChange={(e) => updateRow(idx, 'package_size', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Цена за упаковку ₽</label>
                        <input className="form-input" type="number" placeholder="напр. 1550" value={item.package_price} onChange={(e) => updateRow(idx, 'package_price', e.target.value)} />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingBottom: 10, whiteSpace: 'nowrap', minWidth: 100 }}>
                        {calcUnitCost !== null && (
                          <span>= {calcUnitCost.toFixed(2)} ₽/{unitLabel}</span>
                        )}
                        {item.package_qty && item.package_size && (
                          <div style={{ marginTop: 2 }}>
                            итого {(parseFloat(item.package_qty) * parseFloat(item.package_size)).toFixed(0)} {unitLabel}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Количество ({unitLabel})</label>
                        <input className="form-input" type="number" placeholder="Кол-во" value={item.quantity} onChange={(e) => updateRow(idx, 'quantity', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Цена за {unitLabel} ₽</label>
                        <input className="form-input" type="number" placeholder="Цена за ед." value={item.unit_cost} onChange={(e) => updateRow(idx, 'unit_cost', e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

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
        </ModalOverlay>
      )}

      {scanSupply && (
        <MarkingScanner
          context="supply"
          contextId={scanSupply.id}
          items={(scanSupply.items || []).filter((i) => i.marking_type && i.marking_type !== 'none').map((i) => ({
            product_id: i.product_id,
            product_name: i.product_name,
            marking_type: i.marking_type,
            expected_marked_count: i.expected_marked_count || Math.ceil(i.quantity),
          }))}
          onClose={() => setScanSupply(null)}
          onComplete={() => { setScanSupply(null); load(); }}
        />
      )}
    </div>
  );
}
