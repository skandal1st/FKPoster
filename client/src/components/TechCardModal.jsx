import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import toast from 'react-hot-toast';
import { X, Plus, Trash2, Save } from 'lucide-react';

export default function TechCardModal({ product, allIngredients, onClose, onSaved }) {
  const [ingredients, setIngredients] = useState([]);
  const [outputAmount, setOutputAmount] = useState(1);
  const [recipeDescription, setRecipeDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const safeIngredients = allIngredients || [];

  useEffect(() => {
    if (product) {
      const raw = product.ingredients || [];
      setIngredients(raw.map((i) => ({ ingredient_id: i.ingredient_id ?? '', amount: Number(i.amount) || 0 })));
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

  const addIngredient = () => {
    setIngredients([...ingredients, { ingredient_id: '', amount: 1 }]);
  };

  const updateIngredient = (idx, field, value) => {
    const updated = [...ingredients];
    updated[idx] = { ...updated[idx], [field]: field === 'amount' ? Number(value) : Number(value) };
    setIngredients(updated);
  };

  const removeIngredient = (idx) => {
    setIngredients(ingredients.filter((_, i) => i !== idx));
  };

  // Calculate total cost of ingredients
  const totalIngredientCost = useMemo(() => {
    return ingredients.reduce((sum, ing) => {
      const ingProduct = ingredientMap[ing.ingredient_id];
      const cost = ingProduct ? (Number(ingProduct.cost_price) || 0) * (Number(ing.amount) || 0) : 0;
      return sum + cost;
    }, 0);
  }, [ingredients, ingredientMap]);

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
        ingredients: ingredients.filter((i) => i.ingredient_id),
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
                  <th>Ингредиент</th>
                  <th style={{ width: 90 }}>Кол-во на 1 шт</th>
                  <th style={{ width: 50 }}>Ед.</th>
                  <th style={{ width: 90 }}>Цена за ед.</th>
                  <th style={{ width: 90 }}>Сумма</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing, idx) => {
                  const ingProduct = ingredientMap[ing.ingredient_id];
                  const lineCost = ingProduct ? (Number(ingProduct.cost_price) || 0) * (Number(ing.amount) || 0) : 0;
                  return (
                    <tr key={idx}>
                      <td>
                        <select
                          className="form-input"
                          value={ing.ingredient_id}
                          onChange={(e) => updateIngredient(idx, 'ingredient_id', e.target.value)}
                          style={{ padding: '5px 8px', fontSize: 13 }}
                        >
                          <option value="">Выберите ингредиент</option>
                          {availableIngredients.map((ingItem) => (
                            <option key={ingItem.id} value={ingItem.id}>{ingItem.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="form-input"
                          type="number"
                          step="0.01"
                          min="0"
                          value={ing.amount}
                          onChange={(e) => updateIngredient(idx, 'amount', e.target.value)}
                          style={{ padding: '5px 8px', fontSize: 13 }}
                        />
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {ingProduct ? ingProduct.unit : '—'}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {ingProduct ? (Number(ingProduct.cost_price) || 0).toFixed(2) : '—'} ₽
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
