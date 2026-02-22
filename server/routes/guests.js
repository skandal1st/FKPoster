const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

/** Список гостей (для админки и для выбора в POS) */
router.get('/', async (req, res) => {
  const { search } = req.query;
  let sql = `
    SELECT id, name, phone, discount_type, discount_value, bonus_balance, active, created_at
    FROM guests
    WHERE tenant_id = $1
  `;
  const params = [req.tenantId];
  if (search && String(search).trim()) {
    sql += ` AND (name ILIKE $2 OR phone ILIKE $2)`;
    params.push(`%${String(search).trim()}%`);
  }
  sql += ' ORDER BY name';
  const guests = await all(sql, params);
  res.json(guests);
});

/** Один гость */
router.get('/:id', async (req, res) => {
  const guest = await get(
    'SELECT * FROM guests WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!guest) return res.status(404).json({ error: 'Гость не найден' });
  res.json(guest);
});

/** Статистика по гостю за период: заказы, сумма заказов, сумма скидки */
router.get('/:id/stats', async (req, res) => {
  const guest = await get('SELECT id FROM guests WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!guest) return res.status(404).json({ error: 'Гость не найден' });

  const { from, to } = req.query;
  let sql = `
    SELECT
      COUNT(*)::int AS orders_count,
      SUM(COALESCE(o.total_before_discount, o.total + COALESCE(o.discount_amount, 0))) AS total_ordered,
      COALESCE(SUM(o.discount_amount), 0) AS total_discount,
      COALESCE(SUM(o.total), 0) AS total_paid
    FROM orders o
    WHERE o.tenant_id = $1 AND o.guest_id = $2 AND o.status = 'closed'
  `;
  const params = [req.tenantId, req.params.id];
  if (from) {
    params.push(from);
    sql += ` AND o.closed_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    sql += ` AND o.closed_at <= $${params.length}`;
  }
  const stats = await get(sql, params);

  const totalOrdered = parseFloat(stats.total_ordered) || 0;
  const totalDiscount = parseFloat(stats.total_discount) || 0;
  const totalPaid = parseFloat(stats.total_paid) || 0;

  res.json({
    orders_count: stats.orders_count || 0,
    total_ordered: totalOrdered,
    total_discount: totalDiscount,
    total_paid: totalPaid,
  });
});

/** Создать гостя — только админ */
router.post('/', adminOnly, async (req, res) => {
  const { name, phone, discount_type, discount_value, bonus_balance } = req.body;
  const nameStr = typeof name === 'string' ? name.trim() : '';
  if (!nameStr) return res.status(400).json({ error: 'Укажите имя гостя' });

  const dtype = discount_type === 'fixed' ? 'fixed' : 'percent';
  const dval = Math.max(0, parseFloat(discount_value) || 0);
  const bonus = Math.max(0, parseFloat(bonus_balance) || 0);

  const result = await run(
    `INSERT INTO guests (tenant_id, name, phone, discount_type, discount_value, bonus_balance, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
    [req.tenantId, nameStr, phone ? String(phone).trim() : null, dtype, dval, bonus]
  );
  const guest = await get('SELECT * FROM guests WHERE id = $1', [result.id]);
  res.status(201).json(guest);
});

/** Обновить гостя — только админ */
router.put('/:id', adminOnly, async (req, res) => {
  const { name, phone, discount_type, discount_value, bonus_balance, active } = req.body;
  const guest = await get('SELECT id FROM guests WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!guest) return res.status(404).json({ error: 'Гость не найден' });

  const updates = [];
  const params = [];
  let idx = 1;

  if (name !== undefined) {
    const nameStr = String(name).trim();
    if (!nameStr) return res.status(400).json({ error: 'Имя не может быть пустым' });
    updates.push(`name = $${idx++}`);
    params.push(nameStr);
  }
  if (phone !== undefined) {
    updates.push(`phone = $${idx++}`);
    params.push(phone ? String(phone).trim() : null);
  }
  if (discount_type !== undefined) {
    updates.push(`discount_type = $${idx++}`);
    params.push(discount_type === 'fixed' ? 'fixed' : 'percent');
  }
  if (discount_value !== undefined) {
    updates.push(`discount_value = $${idx++}`);
    params.push(Math.max(0, parseFloat(discount_value) || 0));
  }
  if (bonus_balance !== undefined) {
    updates.push(`bonus_balance = $${idx++}`);
    params.push(Math.max(0, parseFloat(bonus_balance) || 0));
  }
  if (active !== undefined) {
    updates.push(`active = $${idx++}`);
    params.push(!!active);
  }

  if (updates.length === 0) {
    const updated = await get('SELECT * FROM guests WHERE id = $1', [req.params.id]);
    return res.json(updated);
  }

  updates.push('updated_at = NOW()');
  params.push(req.params.id);
  await run(
    `UPDATE guests SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1}`,
    [...params, req.tenantId]
  );
  const updated = await get('SELECT * FROM guests WHERE id = $1', [req.params.id]);
  res.json(updated);
});

/** Удалить (деактивировать) гостя — только админ */
router.delete('/:id', adminOnly, async (req, res) => {
  const r = await run('UPDATE guests SET active = false WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Гость не найден' });
  res.json({ success: true });
});

module.exports = router;
