import { useEffect, useState } from 'react';
import { usePosStore } from '../store/posStore';
import toast from 'react-hot-toast';
import { Plus, Minus, X, Banknote, CreditCard, Trash2, Receipt, Info, User } from 'lucide-react';
import ReceiptModal from '../components/ReceiptModal';
import TechCardPopover from '../components/TechCardPopover';
import MarkingScanner from '../components/MarkingScanner';
import './POS.css';

export default function POS({ embedded = false, onClose }) {
  const {
    categories, products, tables, openOrders, currentOrder, registerDay, guests,
    loadCategories, loadProducts, loadTables, loadOpenOrders, loadRegisterDay, loadGuests,
    createOrder, selectOrder, addItem, removeItem, closeOrder, cancelOrder, clearCurrentOrder,
  } = usePosStore();

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showReceipt, setShowReceipt] = useState(null);
  const [showTablePicker, setShowTablePicker] = useState(false);
  /** Товар, для которого открыт попап с техкартой (описание + граммовки) */
  const [techCardPopoverProduct, setTechCardPopoverProduct] = useState(null);
  /** Способ оплаты для подтверждения закрытия стола: 'cash' | 'card' | null */
  const [paymentConfirm, setPaymentConfirm] = useState(null);
  /** Показать сканер маркировки перед оплатой */
  const [showMarkingScanner, setShowMarkingScanner] = useState(false);
  /** Метод оплаты, отложенный до завершения скана */
  const [pendingPayment, setPendingPayment] = useState(null);
  /** Выбранный гость для скидки */
  const [selectedGuest, setSelectedGuest] = useState(null);

  useEffect(() => {
    loadCategories();
    loadProducts();
    loadTables();
    loadOpenOrders();
    loadRegisterDay();
    loadGuests();
  }, []);

  const filteredProducts = selectedCategory
    ? products.filter((p) => p.category_id === selectedCategory)
    : products;

  const totalBeforeDiscount = currentOrder?.total ?? 0;
  const discountAmount = (() => {
    if (!selectedGuest || !currentOrder) return 0;
    const total = parseFloat(currentOrder.total) || 0;
    if (selectedGuest.discount_type === 'percent') {
      const pct = Math.min(100, Math.max(0, parseFloat(selectedGuest.discount_value) || 0));
      return Math.round((total * pct / 100) * 100) / 100;
    }
    return Math.min(total, Math.max(0, parseFloat(selectedGuest.discount_value) || 0));
  })();
  const totalToPay = Math.max(0, totalBeforeDiscount - discountAmount);
  const activeGuests = guests.filter((g) => g.active !== false);

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

  const handlePayClick = (method) => {
    setPaymentConfirm(method);
  };

  const handlePayConfirm = async () => {
    if (!paymentConfirm) return;
    const method = paymentConfirm;
    setPaymentConfirm(null);
    try {
      const order = await closeOrder(method, selectedGuest?.id ?? null);
      setShowReceipt(order);
      setSelectedGuest(null);
      toast.success('Заказ оплачен');
      if (embedded) {
        // Панель закроется после закрытия чека в ReceiptModal onClose
      }
    } catch (err) {
      if (err.requires_marking) {
        setPendingPayment(method);
        setShowMarkingScanner(true);
      } else {
        toast.error(err.message);
      }
    }
  };

  const handleMarkingScanComplete = async () => {
    setShowMarkingScanner(false);
    if (pendingPayment) {
      const method = pendingPayment;
      setPendingPayment(null);
      try {
        const order = await closeOrder(method, selectedGuest?.id ?? null);
        setShowReceipt(order);
        setSelectedGuest(null);
        toast.success('Заказ оплачен');
      } catch (err) {
        toast.error(err.message);
      }
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
          {filteredProducts.map((product) => {
            const hasTechCard = (product.ingredients?.length > 0) || (product.recipe_description?.trim?.());
            return (
              <button
                key={product.id}
                className="pos-product-card"
                onClick={() => handleAddProduct(product)}
                style={{ '--cat-color': product.category_color }}
              >
                {hasTechCard && (
                  <span
                    className="pos-product-info-icon"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTechCardPopoverProduct(product); }}
                    title="Техкарта: описание и граммовки"
                    aria-label="Техкарта"
                  >
                    <Info size={14} />
                  </span>
                )}
                <div className="pos-product-name">{product.name}</div>
                <div className="pos-product-price">{product.price} ₽</div>
                {product.track_inventory ? (
                  <div className="pos-product-stock">
                    Ост: {product.is_composite && product.available_from_ingredients != null
                      ? `${product.available_from_ingredients} ${product.unit}`
                      : `${product.quantity} ${product.unit}`}
                  </div>
                ) : null}
              </button>
            );
          })}
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

        {currentOrder && (
          <div className="pos-guest-row" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              <User size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Гость (скидка)
            </label>
            <select
              className="form-input"
              value={selectedGuest?.id ?? ''}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                setSelectedGuest(id ? activeGuests.find((g) => g.id === id) ?? null : null);
              }}
              style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
            >
              <option value="">Без гостя</option>
              {activeGuests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.discount_type === 'percent' ? ` (−${g.discount_value}%)` : ` (−${g.discount_value} ₽)`}
                </option>
              ))}
            </select>
          </div>
        )}

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
            {selectedGuest && discountAmount > 0 ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
                  <span>Без скидки:</span>
                  <span>{totalBeforeDiscount} ₽</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--accent)' }}>
                  <span>Скидка ({selectedGuest.name}):</span>
                  <span>−{discountAmount} ₽</span>
                </div>
              </>
            ) : null}
            <div className="pos-order-total">
              <span>К оплате:</span>
              <span>{selectedGuest && discountAmount > 0 ? totalToPay : currentOrder.total} ₽</span>
            </div>
            <div className="pos-pay-buttons">
              <button className="btn btn-success pos-pay-btn" onClick={() => handlePayClick('cash')}>
                <Banknote size={18} /> Наличные
              </button>
              <button className="btn btn-primary pos-pay-btn" onClick={() => handlePayClick('card')}>
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

      {/* Подтверждение закрытия стола при выборе оплаты */}
      {paymentConfirm && currentOrder && (
        <div className="modal-overlay" onClick={() => setPaymentConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Закрыть стол?</h3>
              <button type="button" className="btn-icon" onClick={() => setPaymentConfirm(null)} aria-label="Отмена">
                <X size={18} />
              </button>
            </div>
            <p className="modal-body">
              Оформить оплату <strong>{paymentConfirm === 'cash' ? 'наличными' : 'картой'}</strong> и закрыть стол?
              <br />
              <span style={{ fontSize: 18, fontWeight: 600, marginTop: 8, display: 'block' }}>
                К оплате: {selectedGuest && discountAmount > 0 ? totalToPay : currentOrder.total} ₽
              </span>
            </p>
            <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setPaymentConfirm(null)}>
                Отмена
              </button>
              <button
                type="button"
                className={paymentConfirm === 'cash' ? 'btn btn-success' : 'btn btn-primary'}
                onClick={handlePayConfirm}
              >
                {paymentConfirm === 'cash' ? <Banknote size={18} /> : <CreditCard size={18} />}
                {' '}Закрыть стол
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

      {techCardPopoverProduct && (
        <TechCardPopover
          product={techCardPopoverProduct}
          onClose={() => setTechCardPopoverProduct(null)}
        />
      )}

      {showMarkingScanner && currentOrder && (
        <MarkingScanner
          context="order"
          contextId={currentOrder.id}
          items={(currentOrder.items || []).filter((i) => i.marking_type && i.marking_type !== 'none').map((i) => ({
            product_id: i.product_id,
            product_name: i.product_name,
            marking_type: i.marking_type,
            marked_codes_required: i.marked_codes_required || i.quantity,
          }))}
          onClose={() => { setShowMarkingScanner(false); setPendingPayment(null); }}
          onComplete={handleMarkingScanComplete}
        />
      )}
    </div>
  );
}
