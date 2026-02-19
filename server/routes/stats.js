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

  let groupBy;
  if (group === 'month') {
    groupBy = "to_char(o.closed_at, 'YYYY-MM')";
  } else {
    groupBy = "o.closed_at::date";
  }

  const sales = await all(`
    SELECT ${groupBy}::text as period,
           COUNT(*)::int as orders_count,
           SUM(o.total) as revenue,
           SUM(CASE WHEN o.payment_method = 'cash' THEN o.total ELSE 0 END) as cash_total,
           SUM(CASE WHEN o.payment_method = 'card' THEN o.total ELSE 0 END) as card_total
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
           COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN o.total ELSE 0 END), 0)::numeric as total_cash,
           COALESCE(SUM(CASE WHEN o.payment_method = 'card' THEN o.total ELSE 0 END), 0)::numeric as total_card
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

router.get('/dashboard', adminOnly, async (req, res) => {
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

router.get('/shift/:id', async (req, res) => {
  const shift = await get('SELECT * FROM register_days WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!shift) return res.status(404).json({ error: 'Смена не найдена' });

  const orders = await all(`
    SELECT o.id, o.total, o.payment_method, o.created_at, o.closed_at,
           u.name as cashier_name, t.number as table_number
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
    hourly
  });
});

module.exports = router;
