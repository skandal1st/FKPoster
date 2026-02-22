import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import toast from 'react-hot-toast';
import { X, Plus, Trash2, Save } from 'lucide-react';

export default function TechCardModal({ product, allIngredients, onClose, onSaved }) {
  const [ingredients, setIngredients] = useState([]);
  const [outputAmount, setOutputAmount] = useState(1);
  const [recipeDescription, setRecipeDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState([]);

  const safeIngredients = allIngredients || [];

  useEffect(() => {
    api.get('/ingredient-groups').then(setGroups).catch(() => {});
  }, []);

  useEffect(() => {
    if (product) {
      const raw = product.ingredients || [];
      setIngredients(raw.map((i) => ({
        ingredient_id: i.ingredient_id ?? '',
        ingredient_group_id: i.ingredient_group_id ?? '',
        amount: Number(i.amount) || 0
      })));
      setOutputAmount(Number(product.output_amount) || 1);
      setRecipeDescription(product.recipe_description || '');
    }
  }, [product]);

  // Only ingredients can be used (exclude self if it's an ingredient)
  const availableIngredients = useMemo(
    () => safeIngredients.filter((ing) => ing.id !== product?.id),
    [safeIngredients, product?.id]
  );

  // Build a lookup map for ingredient costs
  const ingredientMap = useMemo(() => {
    const map = {};
    for (const ing of safeIngredients) {
      map[ing.id] = ing;
    }
    return map;
  }, [safeIngredients]);

  // Build group map with avg cost and total stock
  const groupMap = useMemo(() => {
    const map = {};
    for (const g of groups) {
      // Средневзвешенная себестоимость из членов группы
      const members = safeIngredients.filter((i) => i.ingredient_group_id === g.id);
      let totalQty = 0, totalCostQty = 0;
      for (const m of members) {
        const qty = Number(m.quantity) || 0;
        const cost = Number(m.cost_price) || 0;
        totalQty += qty;
        totalCostQty += qty * cost;
      }
      map[g.id] = {
        ...g,
        avg_cost: totalQty > 0 ? totalCostQty / totalQty : 0,
        total_stock: totalQty
      };
    }
    return map;
  }, [groups, safeIngredients]);

  const addIngredient = () => {
    setIngredients([...ingredients, { ingredient_id: '', ingredient_group_id: '', amount: 1 }]);
  };

  // value format: "ing:123" for ingredient, "grp:456" for group
  const handleSelectChange = (idx, value) => {
    const updated = [...ingredients];
    if (value.startsWith('grp:')) {
      updated[idx] = { ...updated[idx], ingredient_id: '', ingredient_group_id: Number(value.slice(4)) };
    } else if (value.startsWith('ing:')) {
      updated[idx] = { ...updated[idx], ingredient_id: Number(value.slice(4)), ingredient_group_id: '' };
    } else {
      updated[idx] = { ...updated[idx], ingredient_id: '', ingredient_group_id: '' };
    }
    setIngredients(updated);
  };

  const updateAmount = (idx, value) => {
    const updated = [...ingredients];
    updated[idx] = { ...updated[idx], amount: Number(value) };
    setIngredients(updated);
  };

  const removeIngredient = (idx) => {
    setIngredients(ingredients.filter((_, i) => i !== idx));
  };

  // Get select value for a row
  const getSelectValue = (ing) => {
    if (ing.ingredient_group_id) return `grp:${ing.ingredient_group_id}`;
    if (ing.ingredient_id) return `ing:${ing.ingredient_id}`;
    return '';
  };

  // Get info for a row (cost, unit)
  const getRowInfo = (ing) => {
    if (ing.ingredient_group_id) {
      const g = groupMap[ing.ingredient_group_id];
      return g ? { unit: g.unit, cost: g.avg_cost, name: g.name } : null;
    }
    if (ing.ingredient_id) {
      const p = ingredientMap[ing.ingredient_id];
      return p ? { unit: p.unit, cost: Number(p.cost_price) || 0, name: p.name } : null;
    }
    return null;
  };

  // Calculate total cost of ingredients
  const totalIngredientCost = useMemo(() => {
    return ingredients.reduce((sum, ing) => {
      const info = getRowInfo(ing);
      return sum + (info ? info.cost * (Number(ing.amount) || 0) : 0);
    }, 0);
  }, [ingredients, ingredientMap, groupMap]);

  // Cost per unit of output
  const costPerUnit = outputAmount > 0 ? totalIngredientCost / outputAmount : totalIngredientCost;

  // Markup percentage
  const price = Number(product?.price) || 0;
  const markup = costPerUnit > 0 ? ((price - costPerUnit) / costPerUnit) * 100 : 0;

  const save = async () => {
    if (!product?.id) return;
    setSaving(true);
    try {
      await api.put(`/products/${product.id}/ingredients`, {
        ingredients: ingredients.filter((i) => i.ingredient_id || i.ingredient_group_id),
        output_amount: outputAmount,
        recipe_description: recipeDescription
      });
      toast.success('Техкарта сохранена');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!product) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Техкарта: {product.name}</h3>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {product.category_name || ''} &middot; Цена: {price} ₽
            </span>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Ingredients table — списание на одну позицию при пробитии */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Состав товара (списание при пробитии 1 шт)
          </div>
          {ingredients.length > 0 && (
            <table className="data-table" style={{ marginBottom: 8 }}>
              <thead>
                <tr>
                  <th>Ингредиент / Группа</th>
                  <th style={{ width: 90 }}>Кол-во на 1 шт</th>
                  <th style={{ width: 50 }}>Ед.</th>
                  <th style={{ width: 90 }}>Цена за ед.</th>
                  <th style={{ width: 90 }}>Сумма</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing, idx) => {
                  const info = getRowInfo(ing);
                  const lineCost = info ? info.cost * (Number(ing.amount) || 0) : 0;
                  return (
                    <tr key={idx}>
                      <td>
                        <select
                          className="form-input"
                          value={getSelectValue(ing)}
                          onChange={(e) => handleSelectChange(idx, e.target.value)}
                          style={{ padding: '5px 8px', fontSize: 13 }}
                        >
                          <option value="">Выберите...</option>
                          {groups.length > 0 && (
                            <optgroup label="Группы">
                              {groups.map((g) => (
                                <option key={`grp-${g.id}`} value={`grp:${g.id}`}>
                                  {g.name} (группа, {Number(g.total_stock).toFixed(0)} {g.unit})
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="Ингредиенты">
                            {availableIngredients.map((ingItem) => (
                              <option key={`ing-${ingItem.id}`} value={`ing:${ingItem.id}`}>{ingItem.name}</option>
                            ))}
                          </optgroup>
                        </select>
                      </td>
                      <td>
                        <input
                          className="form-input"
                          type="number"
                          step="0.01"
                          min="0"
                          value={ing.amount}
                          onChange={(e) => updateAmount(idx, e.target.value)}
                          style={{ padding: '5px 8px', fontSize: 13 }}
                        />
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {info ? info.unit : '—'}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {info ? info.cost.toFixed(2) : '—'} ₽
                        {ing.ingredient_group_id ? <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>средн.</span> : null}
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 500 }}>
                        {lineCost.toFixed(2)} ₽
                      </td>
                      <td>
                        <button type="button" className="btn-icon" onClick={() => removeIngredient(idx)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <button className="btn btn-ghost btn-sm" onClick={addIngredient}>
            <Plus size={14} /> Добавить ингредиент
          </button>
        </div>

        {/* Output amount + recipe description */}
        <div className="form-row" style={{ marginBottom: 16 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Выход порции ({product.unit || 'шт'})</label>
            <input
              className="form-input"
              type="number"
              step="0.01"
              min="0.01"
              value={outputAmount}
              onChange={(e) => setOutputAmount(Number(e.target.value))}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Себестоимость ингредиентов</label>
            <div style={{ padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: 14 }}>
              {totalIngredientCost.toFixed(2)} ₽
            </div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Описание приготовления</label>
          <textarea
            className="form-input"
            rows={3}
            value={recipeDescription}
            onChange={(e) => setRecipeDescription(e.target.value)}
            placeholder="Шаги приготовления..."
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Summary */}
        <div style={{
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          marginBottom: 8,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          fontSize: 13
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Себестоимость порции: </span>
            <strong>{costPerUnit.toFixed(2)} ₽</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Цена продажи: </span>
            <strong>{price.toFixed(2)} ₽</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Наценка: </span>
            <strong style={{ color: markup > 0 ? 'var(--success)' : 'var(--danger)' }}>
              {markup > 0 ? '+' : ''}{markup.toFixed(0)}%
            </strong>
          </div>
        </div>

        {/* Actions */}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            <Save size={15} /> {saving ? 'Сохранение...' : 'Сохранить техкарту'}
          </button>
        </div>
      </div>
    </div>
  );
}
