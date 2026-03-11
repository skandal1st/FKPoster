import { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';

export default function ModifierModal({ product, onConfirm, onClose }) {
  const [selected, setSelected] = useState({});
  // selected = { [modifier_id]: quantity }

  const toggleModifier = (modId) => {
    setSelected((prev) => {
      if (prev[modId]) {
        const next = { ...prev };
        delete next[modId];
        return next;
      }
      return { ...prev, [modId]: 1 };
    });
  };

  const changeQty = (modId, delta) => {
    setSelected((prev) => {
      const newQty = (prev[modId] || 0) + delta;
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[modId];
        return next;
      }
      return { ...prev, [modId]: newQty };
    });
  };

  const modSurcharge = (product.modifiers || []).reduce((sum, m) => {
    const qty = selected[m.id] || 0;
    return sum + parseFloat(m.price) * qty;
  }, 0);

  const totalPrice = parseFloat(product.price) + modSurcharge;

  const handleConfirm = () => {
    const modifiers = Object.entries(selected).map(([id, quantity]) => ({
      modifier_id: Number(id),
      quantity
    }));
    onConfirm(modifiers);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3 className="modal-title">{product.name}</h3>
          <button type="button" className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: '0 0 16px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Выберите добавки:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(product.modifiers || []).map((mod) => {
              const qty = selected[mod.id] || 0;
              const isActive = qty > 0;
              return (
                <div
                  key={mod.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 8,
                    border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background 0.15s'
                  }}
                  onClick={() => { if (!isActive) toggleModifier(mod.id); }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{mod.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>+{mod.price} ₽</div>
                  </div>
                  {isActive ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn-icon" onClick={() => changeQty(mod.id, -1)}>
                        <Minus size={14} />
                      </button>
                      <span style={{ fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{qty}</span>
                      <button type="button" className="btn-icon" onClick={() => changeQty(mod.id, 1)}>
                        <Plus size={14} />
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn-icon" onClick={(e) => { e.stopPropagation(); toggleModifier(mod.id); }}>
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{
          borderTop: '1px solid var(--border)', padding: '12px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Итого:</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{totalPrice} ₽</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <button type="button" className="btn btn-primary" onClick={handleConfirm}>
              Добавить в заказ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
