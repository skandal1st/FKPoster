import { useEffect, useState, useCallback } from 'react';
import { usePosStore } from '../store/posStore';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import {
  LayoutGrid, ShoppingCart, BookOpen,
  Plus, Minus, Trash2, ChefHat,
} from 'lucide-react';
import ModifierModal from '../components/ModifierModal';
import ReceiptModal from '../components/ReceiptModal';
import { formatElapsedTime } from '../utils/formatElapsed';
import { getTableDisplayName } from '../utils/tableDisplay';
import { openPrintWindow, formatReceipt, formatKitchenTicket } from '../utils/print';
import { api } from '../api';
import './MobileHookahPOS.css';

export default function MobileHookahPOS() {
  const {
    halls, tables, categories, products, openOrders, currentOrder, pendingTableId, registerDay, guests, printSettings,
    loadHalls, loadTables, loadCategories, loadProducts, loadOpenOrders, loadRegisterDay, loadGuests, loadWorkshops, loadPrintSettings,
    selectOrder, setPendingTable, addItem, updateItemQty, removeItem, closeOrder, cancelOrder,
  } = usePosStore();

  const { tenant } = useAuthStore();

  const [activeTab, setActiveTab] = useState('tables');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [modifierProduct, setModifierProduct] = useState(null);
  const [paymentSheet, setPaymentSheet] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [mixedCash, setMixedCash] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [showReceipt, setShowReceipt] = useState(null);
  const [paying, setPaying] = useState(false);
  const [loyaltyTiers, setLoyaltyTiers] = useState([]);
  const [, setTick] = useState(0);

  // Timer refresh for table elapsed times
  useEffect(() => {
    if (tenant?.table_timer_mode === 'off') return;
    const iv = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(iv);
  }, [tenant?.table_timer_mode]);

  useEffect(() => {
    loadHalls();
    loadTables();
    loadCategories();
    loadProducts();
    loadOpenOrders();
    loadRegisterDay();
    loadGuests();
    loadWorkshops();
    loadPrintSettings();
    api.get('/loyalty/tiers').then(setLoyaltyTiers).catch(() => {});
  }, []);

  // ── Discount / total calculation ──────────────────────────────────────────

  const rawTotal = parseFloat(currentOrder?.total) || 0;
  const discountAmount = (() => {
    if (!selectedGuest || !currentOrder) return 0;
    if (selectedGuest.discount_type === 'percent') {
      const pct = Math.min(100, Math.max(0, parseFloat(selectedGuest.discount_value) || 0));
      return Math.round(rawTotal * pct / 100 * 100) / 100;
    }
    return Math.min(rawTotal, Math.max(0, parseFloat(selectedGuest.discount_value) || 0));
  })();
  const afterDiscount = Math.max(0, rawTotal - discountAmount);
  const totalToPay = afterDiscount;

  // ── Table helpers ─────────────────────────────────────────────────────────

  const getOrderForTable = useCallback(
    (tableId) => openOrders.find((o) => o.table_id === tableId),
    [openOrders]
  );

  const handleTablePress = async (table) => {
    if (!registerDay) {
      toast.error('Откройте кассовый день');
      return;
    }
    const order = getOrderForTable(table.id);
    try {
      if (order) {
        await selectOrder(order.id);
      } else {
        setPendingTable(table.id);
      }
      setActiveTab('order');
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ── Product / modifier helpers ────────────────────────────────────────────

  const filteredProducts = selectedCategory
    ? products.filter((p) => p.category_id === selectedCategory)
    : products;

  const handleProductPress = (product) => {
    if (!currentOrder && !pendingTableId) {
      toast.error('Сначала выберите стол');
      setActiveTab('tables');
      return;
    }
    if (product.modifiers?.length > 0) {
      setModifierProduct(product);
      return;
    }
    doAddItem(product.id, 1, []);
  };

  const doAddItem = async (productId, quantity, modifiers) => {
    try {
      await addItem(productId, quantity, modifiers);
      setActiveTab('order');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleModifierConfirm = (modifiers) => {
    const product = modifierProduct;
    setModifierProduct(null);
    doAddItem(product.id, 1, modifiers);
  };

  // ── Order actions ─────────────────────────────────────────────────────────

  const handleQtyChange = async (item, delta) => {
    const newQty = item.quantity + delta;
    try {
      if (newQty <= 0) {
        await removeItem(item.id);
      } else {
        await updateItemQty(item.id, newQty);
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Отменить заказ?')) return;
    try {
      await cancelOrder();
      setSelectedGuest(null);
      setActiveTab('tables');
      toast.success('Заказ отменён');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleKitchenPrint = () => {
    if (!currentOrder?.items?.length) return;
    const enrichedItems = currentOrder.items.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      const category = product ? categories.find((c) => c.id === product.category_id) : null;
      return { ...item, workshop_name: item.workshop_name || category?.workshop_name || null };
    });
    const html = formatKitchenTicket({ ...currentOrder, items: enrichedItems }, printSettings);
    const title = getTableDisplayName({
      label: currentOrder.table_label,
      number: currentOrder.table_number,
      fallback: currentOrder.id,
    });
    openPrintWindow(html, `Кухня - ${title}`, { width: printSettings?.receipt_width });
  };

  // ── Payment ───────────────────────────────────────────────────────────────

  const openPaymentSheet = () => {
    setPaymentMethod('cash');
    setMixedCash('');
    setPaymentSheet(true);
  };

  const handlePayConfirm = async () => {
    if (paying) return;
    let paidCash = null;
    let paidCard = null;
    if (paymentMethod === 'mixed') {
      paidCash = parseFloat(mixedCash);
      if (isNaN(paidCash) || paidCash < 0 || paidCash > totalToPay) {
        toast.error('Введите корректную сумму наличных');
        return;
      }
      paidCard = Math.round((totalToPay - paidCash) * 100) / 100;
    }
    setPaying(true);
    setPaymentSheet(false);
    try {
      const order = await closeOrder(
        paymentMethod,
        selectedGuest?.id ?? null,
        paidCash,
        paidCard,
        0
      );
      setSelectedGuest(null);
      setActiveTab('tables');
      toast.success('Заказ оплачен');
      if (printSettings?.auto_print_receipt) {
        const html = formatReceipt(order, tenant, printSettings);
        openPrintWindow(html, `Чек #${order.id}`, { width: printSettings.receipt_width });
      } else {
        setShowReceipt(order);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPaying(false);
    }
  };

  // ── Current table label ───────────────────────────────────────────────────

  const currentTableLabel = (() => {
    if (currentOrder) {
      return getTableDisplayName({
        label: currentOrder.table_label,
        number: currentOrder.table_number,
        fallback: currentOrder.id,
      });
    }
    if (pendingTableId) {
      const t = tables.find((tbl) => tbl.id === pendingTableId);
      if (t) return getTableDisplayName({ label: t.label, number: t.number });
      return 'Новый заказ';
    }
    return null;
  })();

  const itemCount = currentOrder?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mob-pos">
      {/* ── Content ── */}
      <div className="mob-pos__content">
        {activeTab === 'tables' && (
          <TabTables
            halls={halls}
            tables={tables}
            openOrders={openOrders}
            currentOrder={currentOrder}
            tenant={tenant}
            onTablePress={handleTablePress}
            getOrderForTable={getOrderForTable}
          />
        )}

        {activeTab === 'order' && (
          <TabOrder
            currentOrder={currentOrder}
            currentTableLabel={currentTableLabel}
            selectedGuest={selectedGuest}
            setSelectedGuest={setSelectedGuest}
            guests={guests.filter((g) => g.active !== false)}
            discountAmount={discountAmount}
            rawTotal={rawTotal}
            totalToPay={totalToPay}
            loyaltyTiers={loyaltyTiers}
            onQtyChange={handleQtyChange}
            onCancel={handleCancel}
            onKitchenPrint={handleKitchenPrint}
            onPay={openPaymentSheet}
            onGoMenu={() => setActiveTab('menu')}
            paying={paying}
          />
        )}

        {activeTab === 'menu' && (
          <TabMenu
            categories={categories}
            products={filteredProducts}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            onProductPress={handleProductPress}
          />
        )}
      </div>

      {/* ── Bottom Nav ── */}
      <nav className="mob-pos__nav">
        <button
          className={`mob-pos__nav-btn ${activeTab === 'tables' ? 'active' : ''}`}
          onClick={() => setActiveTab('tables')}
        >
          <LayoutGrid size={22} />
          <span>Столы</span>
        </button>
        <button
          className={`mob-pos__nav-btn ${activeTab === 'order' ? 'active' : ''}`}
          onClick={() => setActiveTab('order')}
        >
          <div className="mob-pos__nav-icon-wrap">
            <ShoppingCart size={22} />
            {itemCount > 0 && <span className="mob-pos__badge">{itemCount}</span>}
          </div>
          <span>Заказ</span>
        </button>
        <button
          className={`mob-pos__nav-btn ${activeTab === 'menu' ? 'active' : ''}`}
          onClick={() => setActiveTab('menu')}
        >
          <BookOpen size={22} />
          <span>Меню</span>
        </button>
      </nav>

      {/* ── Modifier bottom sheet ── */}
      {modifierProduct && (
        <ModifierModal
          product={modifierProduct}
          onConfirm={handleModifierConfirm}
          onClose={() => setModifierProduct(null)}
        />
      )}

      {/* ── Payment bottom sheet ── */}
      {paymentSheet && (
        <PaymentSheet
          totalToPay={totalToPay}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          mixedCash={mixedCash}
          setMixedCash={setMixedCash}
          onConfirm={handlePayConfirm}
          onClose={() => setPaymentSheet(false)}
        />
      )}

      {/* ── Receipt modal ── */}
      {showReceipt && (
        <ReceiptModal
          order={showReceipt}
          onClose={() => setShowReceipt(null)}
          printSettings={printSettings}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Tables
// ─────────────────────────────────────────────────────────────────────────────

function TabTables({ halls, tables, openOrders, currentOrder, tenant, onTablePress, getOrderForTable }) {
  const [selectedHall, setSelectedHall] = useState(null);

  useEffect(() => {
    if (halls.length > 0 && !selectedHall) {
      setSelectedHall(halls[0].id);
    }
  }, [halls]);

  const hallTables = tables.filter((t) => t.hall_id === selectedHall);

  return (
    <div className="mob-tab mob-tab--tables">
      {/* Hall tabs */}
      {halls.length > 1 && (
        <div className="mob-hall-tabs">
          {halls.map((h) => (
            <button
              key={h.id}
              className={`mob-hall-tab ${selectedHall === h.id ? 'active' : ''}`}
              onClick={() => setSelectedHall(h.id)}
            >
              {h.name}
            </button>
          ))}
        </div>
      )}

      {hallTables.length === 0 ? (
        <div className="mob-empty">Нет столов</div>
      ) : (
        <div className="mob-table-grid">
          {hallTables.map((table) => {
            const order = getOrderForTable(table.id);
            const isActive = currentOrder?.table_id === table.id;
            const elapsed = order?.timer_started_at
              ? formatElapsedTime(order.timer_started_at)
              : order
                ? formatElapsedTime(order.created_at)
                : null;

            return (
              <button
                key={table.id}
                className={`mob-table-card ${order ? 'occupied' : 'free'} ${isActive ? 'current' : ''}`}
                onClick={() => onTablePress(table)}
              >
                <div className="mob-table-card__status-dot" />
                <div className="mob-table-card__name">
                  {table.label || table.number}
                </div>
                {table.capacity > 0 && (
                  <div className="mob-table-card__seats">{table.capacity} мест</div>
                )}
                {order && (
                  <>
                    <div className="mob-table-card__total">
                      {Math.round(parseFloat(order.total) || 0)} ₽
                    </div>
                    {elapsed && tenant?.table_timer_mode !== 'off' && (
                      <div className="mob-table-card__timer">{elapsed}</div>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Order
// ─────────────────────────────────────────────────────────────────────────────

function TabOrder({
  currentOrder, currentTableLabel, selectedGuest, setSelectedGuest, guests,
  discountAmount, rawTotal, totalToPay,
  loyaltyTiers, onQtyChange, onCancel, onKitchenPrint, onPay, onGoMenu, paying,
}) {
  if (!currentOrder && !currentTableLabel) {
    return (
      <div className="mob-tab mob-tab--order">
        <div className="mob-empty">
          <ShoppingCart size={48} strokeWidth={1.2} />
          <p>Выберите стол</p>
        </div>
      </div>
    );
  }

  const items = currentOrder?.items ?? [];

  return (
    <div className="mob-tab mob-tab--order">
      {/* Header */}
      <div className="mob-order-header">
        <span className="mob-order-title">{currentTableLabel}</span>
        <div className="mob-order-header-actions">
          {items.length > 0 && (
            <button className="mob-icon-btn" onClick={onKitchenPrint} title="На кухню">
              <ChefHat size={20} />
            </button>
          )}
          {currentOrder && (
            <button className="mob-icon-btn mob-icon-btn--danger" onClick={onCancel} title="Отменить">
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="mob-order-items">
        {items.length === 0 ? (
          <div className="mob-order-empty">
            <p>Заказ пустой</p>
            <button className="btn btn-primary" onClick={onGoMenu}>
              <Plus size={16} /> Добавить из меню
            </button>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="mob-order-item">
              <div className="mob-order-item__info">
                <span className="mob-order-item__name">{item.product_name}</span>
                {item.modifiers?.length > 0 && (
                  <span className="mob-order-item__mods">
                    {item.modifiers.map((m) => m.modifier_name).join(', ')}
                  </span>
                )}
                <span className="mob-order-item__price">{item.price} ₽</span>
              </div>
              <div className="mob-order-item__controls">
                <button className="mob-qty-btn" onClick={() => onQtyChange(item, -1)}>
                  <Minus size={14} />
                </button>
                <span className="mob-qty-val">{item.quantity}</span>
                <button className="mob-qty-btn" onClick={() => onQtyChange(item, 1)}>
                  <Plus size={14} />
                </button>
              </div>
              <span className="mob-order-item__total">{Math.round(parseFloat(item.total) || 0)} ₽</span>
            </div>
          ))
        )}
      </div>

      {/* Guest selector */}
      {guests.length > 0 && (
        <div className="mob-guest-row">
          <select
            className="mob-guest-select"
            value={selectedGuest?.id ?? ''}
            onChange={(e) => {
              const g = guests.find((g) => String(g.id) === e.target.value);
              setSelectedGuest(g ?? null);
            }}
          >
            <option value="">Гость / скидка</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}{g.discount_value ? ` (${g.discount_type === 'percent' ? g.discount_value + '%' : g.discount_value + ' ₽'})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Footer totals + Pay button */}
      {items.length > 0 && (
        <div className="mob-order-footer">
          {discountAmount > 0 && (
            <div className="mob-order-footer__row">
              <span>Скидка</span>
              <span>−{discountAmount} ₽</span>
            </div>
          )}
          <div className="mob-order-footer__total">
            <span>Итого</span>
            <span>{Math.round(totalToPay)} ₽</span>
          </div>
          <button
            className="btn btn-primary mob-pay-btn"
            onClick={onPay}
            disabled={paying}
          >
            {paying ? 'Обработка...' : `Оплатить ${Math.round(totalToPay)} ₽`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Menu
// ─────────────────────────────────────────────────────────────────────────────

function TabMenu({ categories, products, selectedCategory, setSelectedCategory, onProductPress }) {
  return (
    <div className="mob-tab mob-tab--menu">
      {/* Category pills */}
      <div className="mob-categories">
        <button
          className={`mob-cat-pill ${!selectedCategory ? 'active' : ''}`}
          onClick={() => setSelectedCategory(null)}
        >
          Все
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`mob-cat-pill ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
            style={{ '--cat-color': cat.color }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="mob-products">
        {products.map((product) => (
          <button
            key={product.id}
            className="mob-product-card"
            onClick={() => onProductPress(product)}
            style={{ '--cat-color': product.category_color }}
          >
            <span className="mob-product-card__name">{product.name}</span>
            <span className="mob-product-card__price">{product.price} ₽</span>
            {product.track_inventory && (
              <span className="mob-product-card__stock">
                Ост: {product.available_from_ingredients ?? product.quantity} {product.unit}
              </span>
            )}
          </button>
        ))}
        {products.length === 0 && <div className="mob-empty">Нет товаров</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

function PaymentSheet({ totalToPay, paymentMethod, setPaymentMethod, mixedCash, setMixedCash, onConfirm, onClose }) {
  const cardAmount = paymentMethod === 'mixed'
    ? Math.max(0, Math.round((totalToPay - (parseFloat(mixedCash) || 0)) * 100) / 100)
    : null;

  return (
    <div className="mob-sheet-backdrop" onClick={onClose}>
      <div className="mob-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mob-sheet__handle" />
        <h3 className="mob-sheet__title">Оплата — {Math.round(totalToPay)} ₽</h3>

        <div className="mob-payment-methods">
          {[
            { value: 'cash', label: 'Наличные' },
            { value: 'card', label: 'Карта' },
            { value: 'mixed', label: 'Смешанная' },
          ].map((m) => (
            <button
              key={m.value}
              className={`mob-payment-method-btn ${paymentMethod === m.value ? 'active' : ''}`}
              onClick={() => setPaymentMethod(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {paymentMethod === 'mixed' && (
          <div className="mob-mixed-row">
            <div className="mob-mixed-field">
              <label>Наличными</label>
              <input
                type="number"
                className="mob-input"
                value={mixedCash}
                onChange={(e) => setMixedCash(e.target.value)}
                placeholder="0"
                min="0"
                step="1"
              />
            </div>
            <div className="mob-mixed-field">
              <label>Картой</label>
              <div className="mob-input mob-input--readonly">{cardAmount} ₽</div>
            </div>
          </div>
        )}

        <button className="btn btn-primary mob-pay-btn" onClick={onConfirm}>
          Подтвердить оплату
        </button>
      </div>
    </div>
  );
}
