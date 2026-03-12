import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, FlaskConical, AlertTriangle, Image, Layers } from 'lucide-react';
import TechCardModal from '../../components/TechCardModal';
import ModalOverlay from '../../components/ModalOverlay';
import TabNav from '../../components/TabNav';
import { CATALOG_TABS } from '../../constants/tabGroups';
import { useAuthStore } from '../../store/authStore';

export default function Products() {
  const hasCostPrice = useAuthStore((s) => s.plan?.features?.cost_price === true);
  const tenant = useAuthStore((s) => s.tenant);
  const isFastPosType = ['coffee', 'fastfood', 'restaurant'].includes(tenant?.business_type);
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [techCardProduct, setTechCardProduct] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    category_id: '', name: '', price: '', cost_price: '', quantity: '',
    unit: 'шт', track_inventory: 1, is_composite: 0, min_quantity: '',
    barcode: '', marking_type: 'none', egais_alcocode: '', tobacco_gtin: '', vat_rate: '',
    image_url: ''
  });
  // Вариации
  const [variants, setVariants] = useState([]);
  // Загрузка изображения
  const [uploading, setUploading] = useState(false);
  // Модификаторы
  const [allModifiers, setAllModifiers] = useState([]);
  const [selectedModifierIds, setSelectedModifierIds] = useState([]);
  const [showNewModifier, setShowNewModifier] = useState(false);
  const [modifierForm, setModifierForm] = useState({ name: '', price: '', cost_price: '', ingredient_id: '' });

  const load = async () => {
    const [prods, ings, cats, mods] = await Promise.all([
      api.get('/products'),
      api.get('/ingredients'),
      api.get('/categories'),
      api.get('/modifiers')
    ]);
    setProducts(prods);
    setIngredients(ings);
    setCategories(cats);
    setAllModifiers(mods);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ category_id: categories[0]?.id || '', name: '', price: '', cost_price: '', quantity: '', unit: 'шт', track_inventory: 1, is_composite: 0, min_quantity: '', barcode: '', marking_type: 'none', egais_alcocode: '', tobacco_gtin: '', vat_rate: '', image_url: '' });
    setSelectedModifierIds([]);
    setVariants([]);
    setShowNewModifier(false);
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      category_id: p.category_id, name: p.name, price: p.price, cost_price: p.cost_price,
      quantity: p.quantity, unit: p.unit, track_inventory: p.track_inventory, is_composite: p.is_composite,
      min_quantity: p.min_quantity || '',
      barcode: p.barcode || '', marking_type: p.marking_type || 'none',
      egais_alcocode: p.egais_alcocode || '', tobacco_gtin: p.tobacco_gtin || '',
      vat_rate: p.vat_rate || '',
      image_url: p.image_url || ''
    });
    setSelectedModifierIds((p.modifiers || []).map((m) => m.id));
    setVariants((p.variants || []).map((v) => ({ name: v.name, price: v.price, cost_price: v.cost_price || 0, barcode: v.barcode || '' })));
    setShowNewModifier(false);
    setShowModal(true);
  };

  const save = async () => {
    try {
      const data = { ...form, price: Number(form.price), cost_price: Number(form.cost_price), quantity: Number(form.quantity), min_quantity: Number(form.min_quantity) || 0, vat_rate: form.vat_rate || null, image_url: form.image_url || null };
      if (editing) {
        const updated = await api.put(`/products/${editing.id}`, data);
        await api.put(`/products/${editing.id}/modifiers`, { modifier_ids: selectedModifierIds });
        if (isFastPosType) {
          await api.put(`/products/${editing.id}/variants`, { variants });
        }
        toast.success('Товар обновлён');
        setProducts((prev) => prev.map((p) => (p.id === editing.id ? { ...p, ...updated } : p)));
      } else {
        const varsPayload = isFastPosType ? variants : undefined;
        const created = await api.post('/products', { ...data, variants: varsPayload });
        if (selectedModifierIds.length > 0) {
          await api.put(`/products/${created.id}/modifiers`, { modifier_ids: selectedModifierIds });
        }
        toast.success('Товар создан');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой (макс. 5 МБ)');
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const res = await api.post('/upload', {
          data: base64,
          mime_type: file.type,
          filename: file.name,
        });
        setForm((f) => ({ ...f, image_url: res.url }));
        setUploading(false);
        toast.success('Изображение загружено');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploading(false);
      toast.error('Ошибка загрузки: ' + err.message);
    }
  };

  const addVariant = () => {
    setVariants((prev) => [...prev, { name: '', price: '', cost_price: '', barcode: '' }]);
  };

  const updateVariant = (index, field, value) => {
    setVariants((prev) => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  };

  const removeVariant = (index) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const createModifier = async () => {
    if (!modifierForm.name) { toast.error('Укажите название модификатора'); return; }
    try {
      const mod = await api.post('/modifiers', {
        name: modifierForm.name,
        price: Number(modifierForm.price) || 0,
        cost_price: Number(modifierForm.cost_price) || 0,
        ingredient_id: modifierForm.ingredient_id ? Number(modifierForm.ingredient_id) : null
      });
      setAllModifiers((prev) => [...prev, mod]);
      setSelectedModifierIds((prev) => [...prev, mod.id]);
      setModifierForm({ name: '', price: '', cost_price: '', ingredient_id: '' });
      setShowNewModifier(false);
      toast.success('Модификатор создан');
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
      <TabNav tabs={CATALOG_TABS} />

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Категория</th>
              <th>Цена</th>
              {hasCostPrice && <th>Себест.</th>}
              <th>Остаток</th>
              <th>Тип</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.image_url ? (
                    <img src={p.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', verticalAlign: 'middle', marginRight: 8 }} />
                  ) : null}
                  {p.name}
                  {p.variants && p.variants.length > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent)', fontWeight: 500 }}>
                      <Layers size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} />{p.variants.length} вар.
                    </span>
                  )}
                </td>
                <td>
                  <span className="color-dot" style={{ background: p.category_color, marginRight: 6 }} />
                  {p.category_name}
                </td>
                <td>{p.price} ₽</td>
                {hasCostPrice && <td>{p.cost_price} ₽</td>}
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
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Редактировать' : 'Новый товар'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            {/* Изображение товара */}
            <div className="form-group">
              <label className="form-label">Изображение</label>
              {form.image_url ? (
                <div style={{ position: 'relative', display: 'inline-block', marginBottom: 8 }}>
                  <img
                    src={form.image_url}
                    alt="Превью"
                    style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-color)' }}
                  />
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => setForm({ ...form, image_url: '' })}
                    style={{
                      position: 'absolute', top: -8, right: -8,
                      background: 'var(--danger)', color: '#fff',
                      borderRadius: '50%', width: 24, height: 24, minWidth: 24, minHeight: 24,
                      padding: 0,
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8,
                  width: '100%', height: 100, borderRadius: 'var(--radius-xl)',
                  border: '2px dashed var(--border-color)', cursor: 'pointer',
                  background: 'var(--bg-input)', transition: 'all 0.2s',
                  color: 'var(--text-muted)', fontSize: 13,
                }}>
                  <Image size={24} />
                  {uploading ? 'Загрузка...' : 'Нажмите для загрузки'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploading} />
                </label>
              )}
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
              {hasCostPrice && (
                <div className="form-group">
                  <label className="form-label">Себестоимость</label>
                  <input className="form-input" type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
                </div>
              )}
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
            <div className="form-group">
              <label className="form-label">Ставка НДС</label>
              <select className="form-input" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}>
                <option value="">По умолчанию (из настроек ККТ)</option>
                <option value="none">Без НДС</option>
                <option value="vat0">НДС 0%</option>
                <option value="vat10">НДС 10%</option>
                <option value="vat20">НДС 20%</option>
                <option value="vat110">НДС 10/110</option>
                <option value="vat120">НДС 20/120</option>
              </select>
            </div>
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
            {/* Модификаторы */}
            <div className="form-group" style={{ marginTop: 16 }}>
              <label className="form-label">Модификаторы (добавки)</label>
              {selectedModifierIds.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {selectedModifierIds.map((id) => {
                    const mod = allModifiers.find((m) => m.id === id);
                    if (!mod) return null;
                    return (
                      <span key={id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '4px 8px', fontSize: 12
                      }}>
                        {mod.name} (+{mod.price} ₽)
                        <button type="button" className="btn-icon" style={{ padding: 0 }}
                          onClick={() => setSelectedModifierIds((prev) => prev.filter((x) => x !== id))}>
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="form-input" style={{ flex: 1 }} value=""
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id && !selectedModifierIds.includes(id)) {
                      setSelectedModifierIds((prev) => [...prev, id]);
                    }
                  }}>
                  <option value="">Добавить модификатор...</option>
                  {allModifiers.filter((m) => !selectedModifierIds.includes(m.id)).map((m) => (
                    <option key={m.id} value={m.id}>{m.name} (+{m.price} ₽)</option>
                  ))}
                </select>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowNewModifier(!showNewModifier); setModifierForm({ name: '', price: '', cost_price: '', ingredient_id: '' }); }}>
                  <Plus size={14} /> Новый
                </button>
              </div>
              {showNewModifier && (
                <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <input className="form-input" placeholder="Название" value={modifierForm.name}
                      onChange={(e) => setModifierForm({ ...modifierForm, name: e.target.value })} autoFocus />
                  </div>
                  <div className="form-row" style={{ gap: 8, marginBottom: 8 }}>
                    <input className="form-input" type="number" placeholder="Цена" value={modifierForm.price}
                      onChange={(e) => setModifierForm({ ...modifierForm, price: e.target.value })} style={{ flex: 1 }} />
                    {hasCostPrice && (
                      <input className="form-input" type="number" placeholder="Себест." value={modifierForm.cost_price}
                        onChange={(e) => setModifierForm({ ...modifierForm, cost_price: e.target.value })} style={{ flex: 1 }} />
                    )}
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <select className="form-input" value={modifierForm.ingredient_id}
                      onChange={(e) => setModifierForm({ ...modifierForm, ingredient_id: e.target.value })}>
                      <option value="">Без привязки к ингредиенту</option>
                      {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit})</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewModifier(false)}>Отмена</button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={createModifier}>Создать</button>
                  </div>
                </div>
              )}
            </div>

            {/* Вариации (размеры) — только для кофеен/фастфуд/ресторан */}
            {isFastPosType && (
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label"><Layers size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />Вариации (размеры)</label>
                {variants.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                    {variants.map((v, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 8, alignItems: 'center',
                        padding: '8px 10px', background: 'var(--bg-tertiary)',
                        borderRadius: 8, border: '1px solid var(--border-color)',
                      }}>
                        <input
                          className="form-input" placeholder="Название (нпр. 0.3л)"
                          value={v.name} onChange={(e) => updateVariant(i, 'name', e.target.value)}
                          style={{ flex: 2, minHeight: 36, padding: '6px 10px' }}
                        />
                        <input
                          className="form-input" type="number" placeholder="Цена"
                          value={v.price} onChange={(e) => updateVariant(i, 'price', e.target.value)}
                          style={{ flex: 1, minHeight: 36, padding: '6px 10px' }}
                        />
                        {hasCostPrice && (
                          <input
                            className="form-input" type="number" placeholder="Себест."
                            value={v.cost_price} onChange={(e) => updateVariant(i, 'cost_price', e.target.value)}
                            style={{ flex: 1, minHeight: 36, padding: '6px 10px' }}
                          />
                        )}
                        <button type="button" className="btn-icon" onClick={() => removeVariant(i)} style={{ flexShrink: 0 }}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={addVariant}>
                  <Plus size={14} /> Добавить вариацию
                </button>
                {variants.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Например: 0.2л — 150₽, 0.4л — 250₽, 0.6л — 350₽
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={save}>Сохранить</button>
            </div>
          </div>
        </ModalOverlay>
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
