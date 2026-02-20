import { X } from 'lucide-react';

/**
 * Всплывающее окно с описанием приготовления и граммовками (только просмотр).
 * Показывается по клику на иконку i у товара с техкартой.
 */
export default function TechCardPopover({ product, onClose }) {
  if (!product) return null;

  const hasRecipe = (product.ingredients?.length > 0) || (product.recipe_description?.trim?.());
  const outAmt = Number(product.output_amount) || 1;
  const unit = product.unit || 'порц';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal tech-card-popover" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3 className="modal-title">{product.name}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ padding: '0 20px 20px' }}>
          {!hasRecipe ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Нет техкарты</p>
          ) : (
            <>
              {product.recipe_description?.trim() ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                    Описание приготовления
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {product.recipe_description.trim()}
                  </div>
                </div>
              ) : null}

              {product.ingredients?.length > 0 ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    Граммовки на {outAmt} {unit}
                  </div>
                  <table className="data-table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>Ингредиент</th>
                        <th style={{ width: 80, textAlign: 'right' }}>Кол-во</th>
                        <th style={{ width: 44 }}>Ед.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.ingredients.map((ing, idx) => (
                        <tr key={idx}>
                          <td>{ing.ingredient_name || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{Number(ing.amount) ?? '—'}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{ing.ingredient_unit || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
