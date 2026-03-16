import { useEffect, useState } from 'react';
import { usePosStore } from '../store/posStore';
import toast from 'react-hot-toast';
import { Plus, Minus, X, Banknote, CreditCard, Trash2, Receipt, Info, User, Printer, ArrowRightLeft, Users } from 'lucide-react';
import ReceiptModal from '../components/ReceiptModal';
import TechCardPopover from '../components/TechCardPopover';
import MarkingScanner from '../components/MarkingScanner';
import ModifierModal from '../components/ModifierModal';
import { useAuthStore } from '../store/authStore';
import { openPrintWindow, formatReceipt, formatKitchenTicket } from '../utils/print';
import { getTableDisplayName } from '../utils/tableDisplay';
import './POS.css';
import './HallMap.css';

export default function POS({ embedded = false, onClose }) {
  const {
    categories, products, tables, halls, openOrders, currentOrder, pendingTableId, registerDay, guests, workshops, printSettings,
    loadCategories, loadProducts, loadTables, loadHalls, loadOpenOrders, loadRegisterDay, loadGuests, loadWorkshops, loadPrintSettings,
    createOrder, selectOrder, addItem, removeItem, closeOrder, cancelOrder, moveOrder, clearCurrentOrder, startTimer,
  } = usePosStore();

  const { tenant } = useAuthStore();

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
  /** Сумма наличных при смешанной оплате */
  const [mixedCashAmount, setMixedCashAmount] = useState('');
  /** Выбранный гость для скидки */
  const [selectedGuest, setSelectedGuest] = useState(null);
  /** Модалка выбора стола для пересадки */
  const [showMovePicker, setShowMovePicker] = useState(false);
  /** Выбранный зал в модалке пересадки */
  const [movePickerHall, setMovePickerHall] = useState(null);
  /** Товар с модификаторами, для которого показываем модальное окно */
  const [modifierProduct, setModifierProduct] = useState(null);

  useEffect(() => {
    loadCategories();
    loadProducts();
    loadTables();
    loadHalls();
    loadOpenOrders();
    loadRegisterDay();
    loadGuests();
    loadWorkshops();
    loadPrintSettings();
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

  const handleKitchenPrint = () => {
    if (!currentOrder?.items?.length) return;
    const enrichedItems = currentOrder.items.map(item => {
      const product = products.find(p => p.id === item.product_id);
      const category = product ? categories.find(c => c.id === product.category_id) : null;
      return { ...item, workshop_name: item.workshop_name || category?.workshop_name || null };
    });
    const html = formatKitchenTicket({ ...currentOrder, items: enrichedItems }, printSettings);
    const kitchenTitle = currentOrder.table_label || (currentOrder.table_number ? `Стол ${currentOrder.table_number}` : `#${currentOrder.id}`);
    openPrintWindow(html, `Кухня - ${kitchenTitle}`, { width: printSettings?.receipt_width });
  };

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
    if (!currentOrder && !pendingTableId) {
      toast.error('Сначала создайте заказ');
      return;
    }
    // Если у товара есть модификаторы — показать модальное окно выбора
    if (product.modifiers && product.modifiers.length > 0) {
      setModifierProduct(product);
      return;
    }
    try {
      await addItem(product.id, 1);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleModifierConfirm = async (modifiers) => {
    if (!modifierProduct) return;
    setModifierProduct(null);
    try {
      await addItem(modifierProduct.id, 1, modifiers);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handlePayClick = () => {
    setPaymentConfirm('cash');
    setMixedCashAmount('');
  };

  const handlePayConfirm = async () => {
    if (!paymentConfirm) return;
    const method = paymentConfirm;
    const orderTotal = selectedGuest && discountAmount > 0 ? totalToPay : parseFloat(currentOrder.total);

    let paidCash = null;
    let paidCard = null;
    if (method === 'mixed') {
      paidCash = parseFloat(mixedCashAmount);
      if (isNaN(paidCash) || paidCash < 0 || paidCash > orderTotal) {
        toast.error('Введите корректную сумму наличных');
        return;
      }
      paidCard = Math.round((orderTotal - paidCash) * 100) / 100;
    }

    setPaymentConfirm(null);
    try {
      const order = await closeOrder(method, selectedGuest?.id ?? null, paidCash, paidCard);
      setShowReceipt(order);
      setSelectedGuest(null);
      toast.success('Заказ оплачен');
      if (printSettings?.auto_print_receipt) {
        const html = formatReceipt(order, tenant, printSettings);
        openPrintWindow(html, `Чек #${order.id}`, { width: printSettings.receipt_width });
      }
      if (embedded) {
        // Панель закроется после закрытия чека в ReceiptModal onClose
      }
    } catch (err) {
      if (err.requires_marking) {
        setPendingPayment({ method, paidCash, paidCard });
        setShowMarkingScanner(true);
      } else if (err.kkt_error) {
        toast.error(err.message, { duration: 6000 });
      } else {
        toast.error(err.message);
      }
    }
  };

  const handleMarkingScanComplete = async () => {
    setShowMarkingScanner(false);
    if (pendingPayment) {
      const { method, paidCash, paidCard } = typeof pendingPayment === 'object' ? pendingPayment : { method: pendingPayment, paidCash: null, paidCard: null };
      setPendingPayment(null);
      try {
        const order = await closeOrder(method, selectedGuest?.id ?? null, paidCash, paidCard);
        setShowReceipt(order);
        setSelectedGuest(null);
        toast.success('Заказ оплачен');
        if (printSettings?.auto_print_receipt) {
          const html = formatReceipt(order, tenant, printSettings);
          openPrintWindow(html, `Чек #${order.id}`, { width: printSettings.receipt_width });
        }
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

  const handleMoveOrder = async (newTableId) => {
    try {
      await moveOrder(newTableId);
      setShowMovePicker(false);
      toast.success('Заказ перемещён');
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
              ? getTableDisplayName({ label: currentOrder.table_label, number: currentOrder.table_number, fallback: currentOrder.id })
              : pendingTableId
                ? 'Новый заказ'
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
              ? `Заказ #${currentOrder.id}${currentOrder.table_number ? ` (${getTableDisplayName({ label: currentOrder.table_label, number: currentOrder.table_number })})` : ''}`
              : pendingTableId
                ? 'Новый заказ — добавьте товар'
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
                {item.modifiers && item.modifiers.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {item.modifiers.map((m) => `${m.modifier_name} x${m.quantity}`).join(', ')}
                  </div>
                )}
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
            <button className="btn btn-success pos-pay-btn" onClick={handlePayClick} style={{ width: '100%' }}>
              <Banknote size={18} /> Оплатить
            </button>
            {workshops.length > 0 && currentOrder.items?.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={handleKitchenPrint} style={{ width: '100%', marginTop: 8 }}>
                <Printer size={16} /> Печать на кухню
              </button>
            )}
            {currentOrder.table_id && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowMovePicker(true)} style={{ width: '100%', marginTop: 8 }}>
                <ArrowRightLeft size={16} /> Пересадить
              </button>
            )}
            {tenant?.table_timer_mode === 'manual' && currentOrder.table_id && !currentOrder.timer_started_at && (
              <button className="btn btn-ghost btn-sm" onClick={() => startTimer(currentOrder.id)} style={{ width: '100%', marginTop: 8 }}>
                &#9654; Запустить таймер
              </button>
            )}
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
        {embedded && !currentOrder && !pendingTableId && (
          <div className="pos-order-footer">
            <p className="pos-embedded-empty">Заказ закрыт</p>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ width: '100%' }}>
              Назад к залу
            </button>
          </div>
        )}
        {embedded && !currentOrder && pendingTableId && (
          <div className="pos-order-footer">
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
              Выберите товар для создания заказа
            </p>
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
            {getTableDisplayName({ label: order.table_label, number: order.table_number, fallback: order.id })}
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
              {tables.filter((t) => !t.locked_by_plan).map((table) => {
                const hasOrder = openOrders.some((o) => o.table_id === table.id);
                return (
                  <button
                    key={table.id}
                    className={`pos-table-btn ${hasOrder ? 'occupied' : ''}`}
                    onClick={() => !hasOrder && handleNewOrder(table.id)}
                    disabled={hasOrder}
                  >
                    {getTableDisplayName({ label: table.label, number: table.number })}
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

      {/* Move table picker modal — hall map style */}
      {showMovePicker && currentOrder && (() => {
        const activeHalls = halls.filter((h) => !h.locked_by_plan);
        const hallId = movePickerHall || activeHalls[0]?.id;
        const hall = activeHalls.find((h) => h.id === hallId);
        const cols = hall?.grid_cols ?? 6;
        const rows = hall?.grid_rows ?? 4;
        const hallTables = tables.filter((t) => t.hall_id === hallId && !t.locked_by_plan);
        const cellSize = 110;
        const gap = 6;
        const gridW = cols * cellSize + (cols - 1) * gap;
        const gridH = rows * cellSize + (rows - 1) * gap;
        const gp = (gx, gy) => ({ x: gx * (cellSize + gap), y: gy * (cellSize + gap) });

        return (
          <div className="modal-overlay" onClick={() => setShowMovePicker(false)}>
            <div className="modal" style={{ maxWidth: Math.max(500, gridW + 48), width: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Пересадить на столик</h3>
                <button className="btn-icon" onClick={() => setShowMovePicker(false)}><X size={18} /></button>
              </div>

              {activeHalls.length > 1 && (
                <div className="hall-tabs" style={{ marginBottom: 12 }}>
                  {activeHalls.map((h) => (
                    <div key={h.id} className={`hall-tab ${hallId === h.id ? 'active' : ''}`}>
                      <button type="button" className="hall-tab-label" onClick={() => setMovePickerHall(h.id)}>
                        {h.name}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ overflow: 'auto', padding: '0 4px 12px' }}>
                <div style={{ position: 'relative', width: gridW, height: gridH, margin: '0 auto' }}>
                  {/* Grid background */}
                  {Array.from({ length: rows }).map((_, row) =>
                    Array.from({ length: cols }).map((_, col) => {
                      const pos = gp(col, row);
                      return (
                        <div
                          key={`c-${row}-${col}`}
                          className="hall-grid-cell"
                          style={{ position: 'absolute', left: pos.x, top: pos.y, width: cellSize, height: cellSize }}
                        />
                      );
                    })
                  )}
                  {/* Tables */}
                  {hallTables.map((table) => {
                    const isCurrent = table.id === currentOrder.table_id;
                    const order = openOrders.find((o) => o.table_id === table.id);
                    const hasOrder = !!order && !isCurrent;
                    const disabled = isCurrent || hasOrder;
                    const gx = Math.max(0, table.grid_x ?? 0);
                    const gy = Math.max(0, table.grid_y ?? 0);
                    const pos = gp(gx, gy);

                    return (
                      <div
                        key={table.id}
                        role={!disabled ? 'button' : undefined}
                        className={`hall-table hall-table--grid ${isCurrent || hasOrder ? 'occupied' : 'free'} ${!disabled ? 'hall-table--clickable' : ''}`}
                        style={{
                          position: 'absolute',
                          left: pos.x,
                          top: pos.y,
                          width: cellSize,
                          height: cellSize,
                          ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                        }}
                        onClick={() => !disabled && handleMoveOrder(table.id)}
                      >
                        <span className="hall-table-dot" data-status={isCurrent || hasOrder ? 'occupied' : 'free'} />
                        <span className={`hall-table-number ${table.label ? 'hall-table-number--label' : ''}`}>
                          {table.label || table.number}
                        </span>
                        <div className="hall-table-meta">
                          <Users size={12} />
                          <span>{table.seats ?? 4} мест</span>
                        </div>
                        {isCurrent && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>текущий</div>}
                        {hasOrder && <div className="hall-table-sum">{Number(order.total).toFixed(0)} ₽</div>}
                      </div>
                    );
                  })}
                </div>
                {hallTables.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Нет столиков в этом зале</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Модалка оплаты с выбором способа */}
      {paymentConfirm && currentOrder && (
        <div className="modal-overlay" onClick={() => setPaymentConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Оплата</h3>
              <button type="button" className="btn-icon" onClick={() => setPaymentConfirm(null)} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
                {selectedGuest && discountAmount > 0 ? totalToPay : currentOrder.total} ₽
              </div>
              <div className="pos-payment-methods">
                <button
                  type="button"
                  className={`pos-payment-method-btn ${paymentConfirm === 'cash' ? 'active' : ''}`}
                  onClick={() => setPaymentConfirm('cash')}
                >
                  <Banknote size={22} />
                  <span>Наличные</span>
                </button>
                <button
                  type="button"
                  className={`pos-payment-method-btn ${paymentConfirm === 'card' ? 'active' : ''}`}
                  onClick={() => setPaymentConfirm('card')}
                >
                  <CreditCard size={22} />
                  <span>Карта</span>
                </button>
                <button
                  type="button"
                  className={`pos-payment-method-btn ${paymentConfirm === 'mixed' ? 'active' : ''}`}
                  onClick={() => { setPaymentConfirm('mixed'); setMixedCashAmount(''); }}
                >
                  <Banknote size={16} /><CreditCard size={16} />
                  <span>Смешанная</span>
                </button>
              </div>
              {paymentConfirm === 'mixed' && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Сумма наличными:</label>
                    <input
                      type="number"
                      className="form-input"
                      value={mixedCashAmount}
                      onChange={(e) => setMixedCashAmount(e.target.value)}
                      placeholder="0"
                      min="0"
                      max={selectedGuest && discountAmount > 0 ? totalToPay : currentOrder.total}
                      style={{ width: '100%', fontSize: 16 }}
                      autoFocus
                    />
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    Картой: <strong>
                      {(() => {
                        const total = selectedGuest && discountAmount > 0 ? totalToPay : parseFloat(currentOrder.total);
                        const cash = parseFloat(mixedCashAmount) || 0;
                        return Math.max(0, Math.round((total - cash) * 100) / 100);
                      })()} ₽
                    </strong>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setPaymentConfirm(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={handlePayConfirm}
              >
                Закрыть стол
              </button>
            </div>
          </div>
        </div>
      )}

      {showReceipt && (
        <ReceiptModal
          order={showReceipt}
          printSettings={printSettings}
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

      {modifierProduct && (
        <ModifierModal
          product={modifierProduct}
          onConfirm={handleModifierConfirm}
          onClose={() => setModifierProduct(null)}
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
