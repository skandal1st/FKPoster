import { useEffect, useState } from 'react';
import { usePosStore } from '../store/posStore';
import toast from 'react-hot-toast';
import { Plus, Minus, X, Banknote, CreditCard, Trash2, Receipt } from 'lucide-react';
import ReceiptModal from '../components/ReceiptModal';
import './POS.css';

export default function POS({ embedded = false, onClose }) {
  const {
    categories, products, tables, openOrders, currentOrder, registerDay,
    loadCategories, loadProducts, loadTables, loadOpenOrders, loadRegisterDay,
    createOrder, selectOrder, addItem, removeItem, closeOrder, cancelOrder, clearCurrentOrder,
  } = usePosStore();

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showReceipt, setShowReceipt] = useState(null);
  const [showTablePicker, setShowTablePicker] = useState(false);

  useEffect(() => {
    loadCategories();
    loadProducts();
    loadTables();
    loadOpenOrders();
    loadRegisterDay();
  }, []);

  const filteredProducts = selectedCategory
    ? products.filter((p) => p.category_id === selectedCategory)
    : products;

  const handleNewOrder = async (tableId) => {
    try {
      await createOrder(tableId);
      setShowTablePicker(false);
      toast.success('Заказ создан');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAddProduct = async (product) => {
    if (!currentOrder) {
      toast.error('Сначала создайте заказ');
      return;
    }
    try {
      await addItem(product.id, 1);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handlePay = async (method) => {
    try {
      const order = await closeOrder(method);
      setShowReceipt(order);
      toast.success('Заказ оплачен');
      if (embedded) {
        // Панель закроется после закрытия чека в ReceiptModal onClose
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Отменить заказ?')) return;
    try {
      await cancelOrder();
      toast.success('Заказ отменён');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className={`pos-page ${embedded ? 'pos-page--embedded' : ''}`}>
      {embedded && onClose && (
        <div className="pos-embedded-header">
          <h3 className="pos-embedded-title">
            {currentOrder
              ? `Стол ${currentOrder.table_number ?? currentOrder.id}`
              : 'Заказ'}
          </h3>
          <button type="button" className="btn-icon pos-embedded-close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
      )}
      <div
        className={embedded ? 'pos-embedded-body' : 'pos-embedded-body-inert'}
        style={embedded ? { display: 'flex', flex: 1, minHeight: 0 } : { display: 'contents' }}
      >
      {/* Left side — catalog */}
      <div className="pos-catalog">
        {/* Categories */}
        <div className="pos-categories">
          <button
            className={`pos-category-btn ${!selectedCategory ? 'active' : ''}`}
            onClick={() => setSelectedCategory(null)}
            style={{ '--cat-color': 'var(--accent)' }}
          >
            Все
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`pos-category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
              style={{ '--cat-color': cat.color }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products grid */}
        <div className="pos-products">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              className="pos-product-card"
              onClick={() => handleAddProduct(product)}
              style={{ '--cat-color': product.category_color }}
            >
              <div className="pos-product-name">{product.name}</div>
              <div className="pos-product-price">{product.price} ₽</div>
              {product.track_inventory ? (
                <div className="pos-product-stock">
                  Ост: {product.quantity} {product.unit}
                </div>
              ) : null}
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <div style={{ color: 'var(--text-muted)', padding: 20 }}>Нет товаров</div>
          )}
        </div>
      </div>

      {/* Right side — order panel */}
      <div className="pos-order-panel">
        <div className="pos-order-header">
          <h3>
            {currentOrder
              ? `Заказ #${currentOrder.id}${currentOrder.table_number ? ` (Стол ${currentOrder.table_number})` : ''}`
              : 'Нет активного заказа'
            }
          </h3>
          {currentOrder && !embedded && (
            <button className="btn-icon" onClick={() => clearCurrentOrder()}>
              <X size={18} />
            </button>
          )}
        </div>

        {!registerDay && (
          <div className="pos-notice">Откройте кассовый день для начала работы</div>
        )}

        {/* Order items */}
        <div className="pos-order-items">
          {currentOrder?.items?.map((item) => (
            <div key={item.id} className="pos-order-item">
              <div className="pos-order-item-info">
                <div className="pos-order-item-name">{item.product_name}</div>
                <div className="pos-order-item-price">{item.price} ₽ x {item.quantity}</div>
              </div>
              <div className="pos-order-item-actions">
                <button className="btn-icon" onClick={() => addItem(item.product_id, -1)}>
                  <Minus size={14} />
                </button>
                <span className="pos-order-item-qty">{item.quantity}</span>
                <button className="btn-icon" onClick={() => addItem(item.product_id, 1)}>
                  <Plus size={14} />
                </button>
                <button className="btn-icon" onClick={() => removeItem(item.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="pos-order-item-total">{item.total} ₽</div>
            </div>
          ))}
        </div>

        {/* Total & pay */}
        {currentOrder && (
          <div className="pos-order-footer">
            <div className="pos-order-total">
              <span>Итого:</span>
              <span>{currentOrder.total} ₽</span>
            </div>
            <div className="pos-pay-buttons">
              <button className="btn btn-success pos-pay-btn" onClick={() => handlePay('cash')}>
                <Banknote size={18} /> Наличные
              </button>
              <button className="btn btn-primary pos-pay-btn" onClick={() => handlePay('card')}>
                <CreditCard size={18} /> Карта
              </button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleCancel} style={{ width: '100%', marginTop: 8 }}>
              Отменить заказ
            </button>
          </div>
        )}

        {!currentOrder && registerDay && !embedded && (
          <div className="pos-order-footer">
            <button className="btn btn-primary" onClick={() => setShowTablePicker(true)} style={{ width: '100%' }}>
              <Plus size={16} /> Новый заказ
            </button>
          </div>
        )}
        {embedded && !currentOrder && (
          <div className="pos-order-footer">
            <p className="pos-embedded-empty">Заказ закрыт</p>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ width: '100%' }}>
              Назад к залу
            </button>
          </div>
        )}
      </div>
      </div>

      {/* Bottom bar — open orders (скрыт в embedded) */}
      {!embedded && (
      <div className="pos-bottom-bar no-print">
        <div className="pos-bottom-bar-label">Открытые заказы:</div>
        {openOrders.map((order) => (
          <button
            key={order.id}
            className={`pos-bottom-order ${currentOrder?.id === order.id ? 'active' : ''}`}
            onClick={() => selectOrder(order.id)}
          >
            {order.table_number ? `Стол ${order.table_number}` : `#${order.id}`}
            <span className="pos-bottom-order-sum">{order.total} ₽</span>
          </button>
        ))}
{openOrders.length === 0 && (
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>нет</span>
        )}
      </div>
      )}

      {/* Table picker modal */}
      {showTablePicker && (
        <div className="modal-overlay" onClick={() => setShowTablePicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Выберите столик</h3>
              <button className="btn-icon" onClick={() => setShowTablePicker(false)}><X size={18} /></button>
            </div>
            <div className="grid-3">
              {tables.map((table) => {
                const hasOrder = openOrders.some((o) => o.table_id === table.id);
                return (
                  <button
                    key={table.id}
                    className={`pos-table-btn ${hasOrder ? 'occupied' : ''}`}
                    onClick={() => !hasOrder && handleNewOrder(table.id)}
                    disabled={hasOrder}
                  >
                    Стол {table.number}
                    {hasOrder && <span className="pos-table-busy">занят</span>}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-ghost" onClick={() => handleNewOrder(null)} style={{ width: '100%' }}>
                Без столика
              </button>
            </div>
          </div>
        </div>
      )}

      {showReceipt && (
        <ReceiptModal
          order={showReceipt}
          onClose={() => {
            setShowReceipt(null);
            if (embedded && onClose) onClose();
          }}
        />
      )}
    </div>
  );
}
