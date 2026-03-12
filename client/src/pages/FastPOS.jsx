import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const ORDER_TYPES = [
  { value: 'dine_in', label: 'В зале' },
  { value: 'take_away', label: 'С собой' },
  { value: 'delivery', label: 'Доставка' },
];

export default function FastPOS() {
  const { tenant } = useAuthStore();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState('dine_in');
  const [customerName, setCustomerName] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [variantPicker, setVariantPicker] = useState(null);
  const [pickerVariant, setPickerVariant] = useState(null);
  const [pickerModifiers, setPickerModifiers] = useState([]);

  useEffect(() => {
    Promise.all([api.get('/products'), api.get('/categories')])
      .then(([prods, cats]) => {
        setProducts(prods);
        const activeCats = cats.filter((c) => c.is_active !== false);
        setCategories(activeCats);
        if (activeCats.length > 0) setActiveCategory(activeCats[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    } else if (activeCategory) {
      list = list.filter((p) => p.category_id === activeCategory);
    }
    return list;
  }, [products, activeCategory, search]);

  const handleProductClick = (product, e) => {
    const hasVariants = product.variants && product.variants.length > 0;
    const hasModifiers = product.modifiers && product.modifiers.length > 0;
    if (hasVariants || hasModifiers) {
      setVariantPicker({ product });
      setPickerVariant(hasVariants ? product.variants[0] : null);
      setPickerModifiers([]);
    } else {
      addToCart(product, null, []);
    }
  };

  const addToCart = (product, variant, modifiers = []) => {
    const modKey = modifiers.length > 0 ? '_m' + modifiers.map(m => m.id).sort().join('-') : '';
    const cartKey = variant ? `${product.id}_v${variant.id}${modKey}` : `${product.id}${modKey}`;
    const basePrice = variant ? parseFloat(variant.price) : parseFloat(product.price);
    const modPrice = modifiers.reduce((s, m) => s + parseFloat(m.price), 0);
    const price = basePrice + modPrice;
    const parts = [product.name];
    if (variant) parts.push(variant.name);
    const itemName = parts.join(' — ');
    const modNames = modifiers.map(m => m.name);

    setCart((prev) => {
      const existing = prev.find((item) => item.cart_key === cartKey);
      if (existing) {
        return prev.map((item) =>
          item.cart_key === cartKey
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
            : item
        );
      }
      return [
        ...prev,
        {
          cart_key: cartKey,
          product_id: product.id,
          variant_id: variant?.id || null,
          name: itemName,
          mod_names: modNames,
          price,
          quantity: 1,
          total: price,
          image_url: product.image_url,
        },
      ];
    });
    setVariantPicker(null);
  };

  const updateQuantity = (cartKey, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.cart_key !== cartKey) return item;
          const newQty = item.quantity + delta;
          return newQty <= 0 ? null : { ...item, quantity: newQty, total: newQty * item.price };
        })
        .filter(Boolean)
    );
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    setPaying(true);
    setError('');
    try {
      const order = await api.post('/orders', { order_type: orderType });
      for (const item of cart) {
        await api.post(`/orders/${order.id}/items`, {
          product_id: item.product_id,
          quantity: item.quantity,
        });
      }
      setCart([]);
      setCustomerName('');
      toast.success('Заказ создан');
    } catch (err) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="spinner" style={{ marginTop: '40vh' }} />;

  return (
    <div style={{ display: 'flex', height: '100vh', gap: 0, position: 'relative' }}>
      {/* Product picker modal */}
      {variantPicker && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setVariantPicker(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-2xl)', padding: 24,
              boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
              minWidth: 320, maxWidth: 400, maxHeight: '80vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {variantPicker.product.image_url && (
                <img src={variantPicker.product.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} />
              )}
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                {variantPicker.product.name}
              </div>
            </div>

            {/* Variants */}
            {variantPicker.product.variants && variantPicker.product.variants.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Размер</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {variantPicker.product.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setPickerVariant(v)}
                      style={{
                        padding: '10px 14px', borderRadius: 'var(--radius-xl)',
                        border: pickerVariant?.id === v.id ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                        background: pickerVariant?.id === v.id ? 'rgba(99,102,241,0.08)' : 'var(--bg-input)',
                        cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', color: 'var(--text-primary)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{v.name}</span>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>{parseFloat(v.price).toLocaleString('ru-RU')} ₽</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Modifiers */}
            {variantPicker.product.modifiers && variantPicker.product.modifiers.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Добавки</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {variantPicker.product.modifiers.map((m) => {
                    const selected = pickerModifiers.some(pm => pm.id === m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          setPickerModifiers(prev =>
                            selected ? prev.filter(pm => pm.id !== m.id) : [...prev, m]
                          );
                        }}
                        style={{
                          padding: '10px 14px', borderRadius: 'var(--radius-xl)',
                          border: selected ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                          background: selected ? 'rgba(99,102,241,0.08)' : 'var(--bg-input)',
                          cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', color: 'var(--text-primary)',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 13 }}>
                          {selected ? '✓ ' : ''}{m.name}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>+{parseFloat(m.price).toLocaleString('ru-RU')} ₽</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: '100%', minHeight: 44, fontSize: 14, fontWeight: 600, borderRadius: 'var(--radius-xl)' }}
              onClick={() => addToCart(variantPicker.product, pickerVariant, pickerModifiers)}
            >
              Добавить
              {(() => {
                const base = pickerVariant ? parseFloat(pickerVariant.price) : parseFloat(variantPicker.product.price);
                const mods = pickerModifiers.reduce((s, m) => s + parseFloat(m.price), 0);
                return ` — ${(base + mods).toLocaleString('ru-RU')} ₽`;
              })()}
            </button>
          </div>
        </div>
      )}

      {/* LEFT: Menu */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Search */}
        <div style={{ padding: '16px 20px 0' }}>
          <input
            className="form-input"
            type="text"
            placeholder="Поиск товаров..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (e.target.value) setActiveCategory(null); }}
            style={{ fontSize: 15 }}
          />
        </div>

        {/* Categories */}
        <div style={{
          display: 'flex', gap: 10, padding: '16px 20px', overflowX: 'auto',
          scrollbarWidth: 'none',
        }}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setSearch(''); }}
              style={{
                padding: '12px 20px', borderRadius: 'var(--radius-2xl)',
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                fontWeight: 600, fontSize: 13,
                background: activeCategory === cat.id ? (cat.color || 'var(--accent)') : 'var(--bg-card)',
                color: activeCategory === cat.id ? '#fff' : 'var(--text-primary)',
                boxShadow: activeCategory === cat.id ? `0 4px 12px ${cat.color || 'var(--accent)'}33` : '0 1px 3px rgba(0,0,0,0.08)',
                transition: 'all 0.2s',
              }}
            >
              {cat.name}
              <span style={{ display: 'block', fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>
                {products.filter((p) => p.category_id === cat.id).length} поз.
              </span>
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '0 20px 20px',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 12, alignContent: 'start',
        }}>
          {filteredProducts.map((product) => {
            const hasVariants = product.variants && product.variants.length > 0;
            const minPrice = hasVariants
              ? Math.min(...product.variants.map((v) => parseFloat(v.price)))
              : parseFloat(product.price);
            return (
              <button
                key={product.id}
                onClick={(e) => handleProductClick(product, e)}
                style={{
                  padding: 12, borderRadius: 'var(--radius-2xl)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-card)', cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                onMouseOut={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    style={{
                      width: '100%', height: 100, objectFit: 'cover',
                      borderRadius: 'var(--radius-xl)',
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%', height: 100, borderRadius: 'var(--radius-xl)',
                    background: 'var(--bg-tertiary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28, opacity: 0.3,
                  }}>
                    ☕
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {product.name}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                  {hasVariants ? `от ${minPrice.toLocaleString('ru-RU')} ₽` : `${parseFloat(product.price).toLocaleString('ru-RU')} ₽`}
                </div>
                {hasVariants && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {product.variants.length} вариант{product.variants.length > 1 ? (product.variants.length < 5 ? 'а' : 'ов') : ''}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT: Receipt */}
      <div style={{
        width: 340, display: 'flex', flexDirection: 'column',
        background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
            Новый заказ
          </div>
          {/* Order type tabs */}
          <div style={{ display: 'flex', gap: 0, borderRadius: 'var(--radius-xl)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            {ORDER_TYPES.map((ot) => (
              <button
                key={ot.value}
                onClick={() => setOrderType(ot.value)}
                style={{
                  flex: 1, padding: '8px 12px', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: orderType === ot.value ? 'var(--accent)' : 'transparent',
                  color: orderType === ot.value ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                {ot.label}
              </button>
            ))}
          </div>
          <input
            className="form-input"
            type="text"
            placeholder="Имя клиента"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            style={{ marginTop: 12, fontSize: 13 }}
          />
        </div>

        {/* Cart items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {cart.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40, fontSize: 13 }}>
              Добавьте товары
            </div>
          )}
          {cart.map((item) => (
            <div
              key={item.cart_key}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 0', borderBottom: '1px solid var(--border-color)',
              }}
            >
              {item.image_url ? (
                <img src={item.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-tertiary)', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </div>
                {item.mod_names && item.mod_names.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    +{item.mod_names.join(', ')}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {item.price.toLocaleString('ru-RU')} ₽
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button className="btn-icon" style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, fontSize: 16 }} onClick={() => updateQuantity(item.cart_key, -1)}>−</button>
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 16, textAlign: 'center', color: 'var(--text-primary)' }}>{item.quantity}</span>
                <button className="btn-icon" style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, fontSize: 16 }} onClick={() => updateQuantity(item.cart_key, 1)}>+</button>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, width: 60, textAlign: 'right', color: 'var(--text-primary)' }}>
                {item.total.toLocaleString('ru-RU')} ₽
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)' }}>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span>Итого</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>
              {cartTotal.toLocaleString('ru-RU')} ₽
            </span>
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', minHeight: 48, fontSize: 15, fontWeight: 600, marginTop: 12, borderRadius: 'var(--radius-2xl)' }}
            disabled={cart.length === 0 || paying}
            onClick={handlePlaceOrder}
          >
            {paying ? 'Создание...' : 'Создать заказ'}
          </button>
        </div>
      </div>
    </div>
  );
}
