const express = require('express');
const { all, get } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

router.get('/sales', async (req, res) => {
  const { from, to, group } = req.query;
  const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = to || new Date().toISOString().split('T')[0];

  const ALLOWED_GROUPS = {
    month: "to_char(o.closed_at, 'YYYY-MM')",
    day: "o.closed_at::date",
  };
  const groupBy = ALLOWED_GROUPS[group] || ALLOWED_GROUPS.day;

  const sales = await all(`
    SELECT ${groupBy}::text as period,
           COUNT(*)::int as orders_count,
           SUM(o.total) as revenue,
           COALESCE(SUM(o.paid_cash), 0) as cash_total,
           COALESCE(SUM(o.paid_card), 0) as card_total
    FROM orders o
    WHERE o.status = 'closed'
      AND o.closed_at::date >= $1 AND o.closed_at::date <= $2
      AND o.tenant_id = $3
    GROUP BY ${groupBy}
    ORDER BY period
  `, [dateFrom, dateTo, req.tenantId]);

  const costData = await all(`
    SELECT ${groupBy}::text as period,
           SUM(oi.cost_price * oi.quantity) as total_cost
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE o.status = 'closed'
      AND o.closed_at::date >= $1 AND o.closed_at::date <= $2
      AND o.tenant_id = $3
    GROUP BY ${groupBy}
  `, [dateFrom, dateTo, req.tenantId]);

  const costMap = {};
  for (const c of costData) {
    costMap[c.period] = parseFloat(c.total_cost);
  }

  for (const s of sales) {
    s.revenue = parseFloat(s.revenue);
    s.cash_total = parseFloat(s.cash_total);
    s.card_total = parseFloat(s.card_total);
    s.cost = costMap[s.period] || 0;
    s.profit = s.revenue - s.cost;
  }

  const summary = await get(`
    SELECT COUNT(*)::int as total_orders,
           COALESCE(SUM(o.total), 0)::numeric as total_revenue,
           COALESCE(SUM(o.paid_cash), 0)::numeric as total_cash,
           COALESCE(SUM(o.paid_card), 0)::numeric as total_card
    FROM orders o
    WHERE o.status = 'closed'
      AND o.closed_at::date >= $1 AND o.closed_at::date <= $2
      AND o.tenant_id = $3
  `, [dateFrom, dateTo, req.tenantId]);

  const costSummary = await get(`
    SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0)::numeric as total_cost
    FROM orders o JOIN order_items oi ON o.id = oi.order_id
    WHERE o.status = 'closed' AND o.closed_at::date >= $1 AND o.closed_at::date <= $2 AND o.tenant_id = $3
  `, [dateFrom, dateTo, req.tenantId]);

  summary.total_revenue = parseFloat(summary.total_revenue);
  summary.total_cash = parseFloat(summary.total_cash);
  summary.total_card = parseFloat(summary.total_card);
  summary.total_cost = parseFloat(costSummary?.total_cost || 0);
  summary.total_profit = summary.total_revenue - summary.total_cost;

  res.json({ sales, summary });
});

router.get('/products', async (req, res) => {
  const { from, to } = req.query;
  const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = to || new Date().toISOString().split('T')[0];

  const products = await all(`
    SELECT oi.product_name,
           SUM(oi.quantity)::int as total_qty,
           SUM(oi.total) as total_revenue,
           SUM(oi.cost_price * oi.quantity) as total_cost
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status = 'closed'
      AND o.closed_at::date >= $1 AND o.closed_at::date <= $2
      AND o.tenant_id = $3
    GROUP BY oi.product_id, oi.product_name
    ORDER BY total_revenue DESC
    LIMIT 20
  `, [dateFrom, dateTo, req.tenantId]);

  const categories = await all(`
    SELECT c.name, c.color,
           SUM(oi.total) as total_revenue,
           SUM(oi.quantity)::int as total_qty
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    WHERE o.status = 'closed'
      AND o.closed_at::date >= $1 AND o.closed_at::date <= $2
      AND o.tenant_id = $3
    GROUP BY c.id, c.name, c.color
    ORDER BY total_revenue DESC
  `, [dateFrom, dateTo, req.tenantId]);

  res.json({ products, categories });
});

router.get('/inventory', adminOnly, async (req, res) => {
  const { category_id } = req.query;
  let where = 'WHERE p.active = true AND p.track_inventory = true AND p.tenant_id = $1';
  const params = [req.tenantId];
  let idx = 2;
  if (category_id) {
    where += ` AND p.category_id = $${idx++}`;
    params.push(category_id);
  }

  const items = await all(`
    SELECT p.id, p.name, p.quantity, p.min_quantity, p.unit, p.cost_price,
           (p.quantity * p.cost_price) as stock_value,
           c.name as category_name, c.color as category_color,
           CASE WHEN p.min_quantity > 0 AND p.quantity <= p.min_quantity THEN true ELSE false END as is_low_stock
    FROM products p
    JOIN categories c ON p.category_id = c.id
    ${where}
    ORDER BY c.sort_order, p.name
  `, params);

  const total_value = items.reduce((s, i) => s + parseFloat(i.stock_value || 0), 0);
  const categories = await all('SELECT id, name FROM categories WHERE active = true AND tenant_id = $1 ORDER BY sort_order', [req.tenantId]);

  res.json({ items, total_value, categories });
});

router.get('/dashboard', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const todayStats = await get(`
    SELECT COUNT(*)::int as orders_count,
           COALESCE(SUM(o.total), 0)::numeric as revenue
    FROM orders o
    WHERE o.status = 'closed' AND o.closed_at::date = $1 AND o.tenant_id = $2
  `, [today, req.tenantId]);

  const todayCost = await get(`
    SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0)::numeric as total_cost
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status = 'closed' AND o.closed_at::date = $1 AND o.tenant_id = $2
  `, [today, req.tenantId]);

  const weekAgoStats = await get(`
    SELECT COUNT(*)::int as orders_count,
           COALESCE(SUM(o.total), 0)::numeric as revenue
    FROM orders o
    WHERE o.status = 'closed' AND o.closed_at::date = $1 AND o.tenant_id = $2
  `, [weekAgo, req.tenantId]);

  const openOrders = await get(
    "SELECT COUNT(*)::int as count FROM orders WHERE status = 'open' AND tenant_id = $1",
    [req.tenantId]
  );

  const stockValue = await get(`
    SELECT COALESCE(SUM(quantity * cost_price), 0)::numeric as total
    FROM products WHERE active = true AND track_inventory = true AND tenant_id = $1
  `, [req.tenantId]);

  const lowStock = await get(`
    SELECT COUNT(*)::int as count FROM products
    WHERE active = true AND track_inventory = true AND min_quantity > 0 AND quantity <= min_quantity AND tenant_id = $1
  `, [req.tenantId]);

  const trend = await all(`
    SELECT o.closed_at::date::text as day,
           COALESCE(SUM(o.total), 0) as revenue
    FROM orders o
    WHERE o.status = 'closed' AND o.closed_at::date >= (CURRENT_DATE - INTERVAL '6 days')::date AND o.tenant_id = $1
    GROUP BY o.closed_at::date
    ORDER BY day
  `, [req.tenantId]);

  const topProducts = await all(`
    SELECT oi.product_name, SUM(oi.quantity)::int as qty, SUM(oi.total) as revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status = 'closed' AND o.closed_at::date = $1 AND o.tenant_id = $2
    GROUP BY oi.product_id, oi.product_name
    ORDER BY revenue DESC LIMIT 5
  `, [today, req.tenantId]);

  const categorySales = await all(`
    SELECT c.name, c.color, SUM(oi.total) as revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    WHERE o.status = 'closed' AND o.closed_at::date = $1 AND o.tenant_id = $2
    GROUP BY c.id, c.name, c.color
    ORDER BY revenue DESC
  `, [today, req.tenantId]);

  const revenue = parseFloat(todayStats.revenue || 0);
  const profit = revenue - parseFloat(todayCost.total_cost || 0);
  const prevRevenue = parseFloat(weekAgoStats.revenue || 0);
  const revenueChange = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : 0;

  res.json({
    revenue,
    profit,
    orders_count: todayStats.orders_count,
    revenue_change: revenueChange,
    open_orders: openOrders.count,
    stock_value: parseFloat(stockValue.total),
    low_stock_count: lowStock.count,
    trend,
    top_products: topProducts,
    category_sales: categorySales
  });
});

// Анализ себестоимости
router.get('/cost-analysis', async (req, res) => {
  const { from, to } = req.query;
  const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = to || new Date().toISOString().split('T')[0];

  const products = await all(`
    SELECT oi.product_name,
           SUM(oi.quantity)::int as qty,
           SUM(oi.total) as revenue,
           SUM(oi.cost_price * oi.quantity) as cost,
           SUM(oi.total) - SUM(oi.cost_price * oi.quantity) as profit,
           CASE WHEN SUM(oi.total) > 0
             THEN ROUND((SUM(oi.total) - SUM(oi.cost_price * oi.quantity)) / SUM(oi.total) * 100, 1)
             ELSE 0 END as margin_pct
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status = 'closed' AND o.closed_at::date >= $1 AND o.closed_at::date <= $2 AND o.tenant_id = $3
    GROUP BY oi.product_name
    ORDER BY profit DESC
  `, [dateFrom, dateTo, req.tenantId]);

  const categories = await all(`
    SELECT c.name, c.color,
           SUM(oi.quantity)::int as qty,
           SUM(oi.total) as revenue,
           SUM(oi.cost_price * oi.quantity) as cost,
           SUM(oi.total) - SUM(oi.cost_price * oi.quantity) as profit,
           CASE WHEN SUM(oi.total) > 0
             THEN ROUND((SUM(oi.total) - SUM(oi.cost_price * oi.quantity)) / SUM(oi.total) * 100, 1)
             ELSE 0 END as margin_pct
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    WHERE o.status = 'closed' AND o.closed_at::date >= $1 AND o.closed_at::date <= $2 AND o.tenant_id = $3
    GROUP BY c.id, c.name, c.color
    ORDER BY profit DESC
  `, [dateFrom, dateTo, req.tenantId]);

  for (const p of products) {
    p.revenue = parseFloat(p.revenue || 0);
    p.cost = parseFloat(p.cost || 0);
    p.profit = parseFloat(p.profit || 0);
    p.margin_pct = parseFloat(p.margin_pct || 0);
  }
  for (const c of categories) {
    c.revenue = parseFloat(c.revenue || 0);
    c.cost = parseFloat(c.cost || 0);
    c.profit = parseFloat(c.profit || 0);
    c.margin_pct = parseFloat(c.margin_pct || 0);
  }

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const totalCost = products.reduce((s, p) => s + p.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0;

  res.json({
    products,
    categories,
    summary: { total_revenue: totalRevenue, total_cost: totalCost, total_profit: totalProfit, avg_margin: avgMargin }
  });
});

// Посещаемость
router.get('/traffic', async (req, res) => {
  const { from, to } = req.query;
  const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = to || new Date().toISOString().split('T')[0];

  const hourly = await all(`
    SELECT EXTRACT(HOUR FROM o.created_at)::int as hour,
           COUNT(*)::int as orders_count,
           SUM(o.total) as revenue,
           ROUND(AVG(o.total))::int as avg_check
    FROM orders o
    WHERE o.status = 'closed' AND o.closed_at::date >= $1 AND o.closed_at::date <= $2 AND o.tenant_id = $3
    GROUP BY hour ORDER BY hour
  `, [dateFrom, dateTo, req.tenantId]);

  const daily = await all(`
    SELECT EXTRACT(ISODOW FROM o.created_at)::int as day_of_week,
           COUNT(*)::int as orders_count,
           SUM(o.total) as revenue,
           ROUND(AVG(o.total))::int as avg_check
    FROM orders o
    WHERE o.status = 'closed' AND o.closed_at::date >= $1 AND o.closed_at::date <= $2 AND o.tenant_id = $3
    GROUP BY day_of_week ORDER BY day_of_week
  `, [dateFrom, dateTo, req.tenantId]);

  for (const h of hourly) {
    h.revenue = parseFloat(h.revenue || 0);
  }
  for (const d of daily) {
    d.revenue = parseFloat(d.revenue || 0);
  }

  const totalOrders = hourly.reduce((s, h) => s + h.orders_count, 0);
  const totalRevenue = hourly.reduce((s, h) => s + h.revenue, 0);

  const peakHour = hourly.length > 0 ? hourly.reduce((a, b) => b.orders_count > a.orders_count ? b : a).hour : null;
  const peakDay = daily.length > 0 ? daily.reduce((a, b) => b.orders_count > a.orders_count ? b : a).day_of_week : null;

  const daysInRange = Math.max(1, Math.ceil((new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24)) + 1);
  const avgOrdersPerDay = Math.round(totalOrders / daysInRange);

  res.json({
    hourly,
    daily,
    peak_hour: peakHour,
    peak_day: peakDay,
    total_orders: totalOrders,
    total_revenue: totalRevenue,
    avg_check: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    avg_orders_per_day: avgOrdersPerDay
  });
});

// Статистика сотрудников
router.get('/employees', async (req, res) => {
  const { from, to } = req.query;
  const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = to || new Date().toISOString().split('T')[0];

  const employees = await all(`
    SELECT u.id, u.name,
           COUNT(o.id)::int as orders_count,
           SUM(o.total) as revenue,
           ROUND(AVG(o.total))::int as avg_check,
           COALESCE(SUM(o.paid_cash), 0) as cash_total,
           COALESCE(SUM(o.paid_card), 0) as card_total
    FROM orders o
    JOIN users u ON o.user_id = u.id
    WHERE o.status = 'closed' AND o.closed_at::date >= $1 AND o.closed_at::date <= $2 AND o.tenant_id = $3
    GROUP BY u.id, u.name
    ORDER BY revenue DESC
  `, [dateFrom, dateTo, req.tenantId]);

  for (const e of employees) {
    e.revenue = parseFloat(e.revenue || 0);
    e.cash_total = parseFloat(e.cash_total || 0);
    e.card_total = parseFloat(e.card_total || 0);
  }

  res.json({ employees });
});

// Анализ скидок
router.get('/discounts', async (req, res) => {
  const { from, to } = req.query;
  const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = to || new Date().toISOString().split('T')[0];

  const summary = await get(`
    SELECT COUNT(*)::int as total_orders,
           COUNT(CASE WHEN discount_amount > 0 THEN 1 END)::int as discounted_orders,
           COALESCE(SUM(CASE WHEN discount_amount > 0 THEN discount_amount ELSE 0 END), 0)::numeric as total_discount,
           COALESCE(SUM(total), 0)::numeric as total_revenue,
           COALESCE(SUM(CASE WHEN discount_amount > 0 THEN total + discount_amount ELSE total END), 0)::numeric as total_before_discount
    FROM orders
    WHERE status = 'closed' AND closed_at::date >= $1 AND closed_at::date <= $2 AND tenant_id = $3
  `, [dateFrom, dateTo, req.tenantId]);

  summary.total_discount = parseFloat(summary.total_discount || 0);
  summary.total_revenue = parseFloat(summary.total_revenue || 0);
  summary.total_before_discount = parseFloat(summary.total_before_discount || 0);
  summary.discount_pct = summary.total_before_discount > 0
    ? Math.round(summary.total_discount / summary.total_before_discount * 1000) / 10
    : 0;

  const byGuest = await all(`
    SELECT g.name, g.discount_type, g.discount_value,
           COUNT(o.id)::int as orders_count,
           SUM(o.discount_amount) as total_discount,
           SUM(o.total) as total_paid
    FROM orders o
    JOIN guests g ON o.guest_id = g.id
    WHERE o.status = 'closed' AND o.discount_amount > 0
      AND o.closed_at::date >= $1 AND o.closed_at::date <= $2 AND o.tenant_id = $3
    GROUP BY g.id, g.name, g.discount_type, g.discount_value
    ORDER BY total_discount DESC
  `, [dateFrom, dateTo, req.tenantId]);

  for (const g of byGuest) {
    g.total_discount = parseFloat(g.total_discount || 0);
    g.total_paid = parseFloat(g.total_paid || 0);
    g.discount_value = parseFloat(g.discount_value || 0);
  }

  res.json({ summary, by_guest: byGuest });
});

router.get('/shift/:id', async (req, res) => {
  const shift = await get('SELECT * FROM register_days WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!shift) return res.status(404).json({ error: 'Смена не найдена' });

  const orders = await all(`
    SELECT o.id, o.total, o.payment_method, o.created_at, o.closed_at,
           u.name as cashier_name, t.number as table_number, t.label as table_label
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE o.register_day_id = $1 AND o.status = 'closed'
    ORDER BY o.closed_at
  `, [req.params.id]);

  const costData = await get(`
    SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0)::numeric as total_cost
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.register_day_id = $1 AND o.status = 'closed'
  `, [req.params.id]);

  const topProducts = await all(`
    SELECT oi.product_name, SUM(oi.quantity)::int as qty, SUM(oi.total) as revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.register_day_id = $1 AND o.status = 'closed'
    GROUP BY oi.product_id, oi.product_name
    ORDER BY revenue DESC LIMIT 5
  `, [req.params.id]);

  const hourly = await all(`
    SELECT to_char(o.closed_at, 'HH24') as hour, SUM(o.total) as revenue, COUNT(*)::int as orders_count
    FROM orders o
    WHERE o.register_day_id = $1 AND o.status = 'closed'
    GROUP BY to_char(o.closed_at, 'HH24')
    ORDER BY hour
  `, [req.params.id]);

  const workshopTotals = await all(`
    SELECT w.id, w.name,
      COALESCE(SUM(oi.total), 0) as revenue,
      COALESCE(SUM(oi.total * o.paid_cash / NULLIF(o.total, 0)), 0) as cash,
      COALESCE(SUM(oi.total * o.paid_card / NULLIF(o.total, 0)), 0) as card
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN workshops w ON c.workshop_id = w.id
    WHERE o.register_day_id = $1 AND o.status = 'closed' AND o.tenant_id = $2
    GROUP BY w.id, w.name
    ORDER BY revenue DESC
  `, [req.params.id, req.tenantId]);

  for (const r of workshopTotals) {
    r.revenue = parseFloat(r.revenue);
    r.cash = parseFloat(r.cash);
    r.card = parseFloat(r.card);
  }

  const revenue = orders.reduce((s, o) => s + parseFloat(o.total), 0);
  const profit = revenue - parseFloat(costData.total_cost || 0);
  const avgCheck = orders.length > 0 ? Math.round(revenue / orders.length) : 0;

  res.json({
    shift,
    revenue,
    profit,
    orders_count: orders.length,
    avg_check: avgCheck,
    orders,
    top_products: topProducts,
    hourly,
    workshop_totals: workshopTotals
  });
});

module.exports = router;
