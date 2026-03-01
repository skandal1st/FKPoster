const express = require('express');
const { all, get, run, transaction } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription, adminOnly);

// ========== НАСТРОЙКИ ==========

// GET /settings — все сотрудники с их ставками и цеховыми процентами
router.get('/settings', async (req, res) => {
  const users = await all(`
    SELECT u.id, u.name, u.role,
      COALESCE(ss.daily_rate, 0) as daily_rate
    FROM users u
    LEFT JOIN salary_settings ss ON ss.user_id = u.id AND ss.tenant_id = u.tenant_id
    WHERE u.tenant_id = $1 AND u.active = true
    ORDER BY u.name
  `, [req.tenantId]);

  // Получить цеховые ставки для всех сотрудников
  const rates = await all(`
    SELECT swr.user_id, swr.workshop_id, swr.percentage, w.name as workshop_name
    FROM salary_workshop_rates swr
    JOIN workshops w ON w.id = swr.workshop_id
    WHERE swr.tenant_id = $1
    ORDER BY w.name
  `, [req.tenantId]);

  // Группировка ставок по сотрудникам
  const ratesByUser = {};
  for (const r of rates) {
    if (!ratesByUser[r.user_id]) ratesByUser[r.user_id] = [];
    ratesByUser[r.user_id].push({
      workshop_id: r.workshop_id,
      workshop_name: r.workshop_name,
      percentage: parseFloat(r.percentage),
    });
  }

  const result = users.map((u) => ({
    ...u,
    daily_rate: parseFloat(u.daily_rate),
    workshop_rates: ratesByUser[u.id] || [],
  }));

  res.json(result);
});

// PUT /settings/:userId — обновить настройки зарплаты сотрудника
router.put('/settings/:userId', async (req, res) => {
  const { daily_rate, workshop_rates } = req.body;
  const userId = parseInt(req.params.userId);

  // Проверить что сотрудник принадлежит тенанту
  const user = await get(
    'SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND active = true',
    [userId, req.tenantId]
  );
  if (!user) return res.status(404).json({ error: 'Сотрудник не найден' });

  await transaction(async (tx) => {
    // Upsert daily_rate
    await tx.run(`
      INSERT INTO salary_settings (user_id, tenant_id, daily_rate, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, tenant_id)
      DO UPDATE SET daily_rate = $3, updated_at = NOW()
    `, [userId, req.tenantId, daily_rate || 0]);

    // Удалить старые цеховые ставки
    await tx.run(
      'DELETE FROM salary_workshop_rates WHERE user_id = $1 AND tenant_id = $2',
      [userId, req.tenantId]
    );

    // Вставить новые
    if (workshop_rates && workshop_rates.length > 0) {
      for (const wr of workshop_rates) {
        if (wr.percentage > 0) {
          await tx.run(`
            INSERT INTO salary_workshop_rates (user_id, workshop_id, tenant_id, percentage)
            VALUES ($1, $2, $3, $4)
          `, [userId, wr.workshop_id, req.tenantId, wr.percentage]);
        }
      }
    }
  });

  res.json({ success: true });
});

// ========== РАСЧЁТ ==========

// GET /calculate?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/calculate', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'Укажите период (from, to)' });
  }

  // 1. Все сотрудники с настройками
  const employees = await all(`
    SELECT u.id as user_id, u.name,
      COALESCE(ss.daily_rate, 0) as daily_rate
    FROM users u
    LEFT JOIN salary_settings ss ON ss.user_id = u.id AND ss.tenant_id = u.tenant_id
    WHERE u.tenant_id = $1 AND u.active = true
    ORDER BY u.name
  `, [req.tenantId]);

  // 2. Дни выходов за период
  const daysWorked = await all(`
    SELECT user_id, COUNT(*)::int as days_worked
    FROM work_schedule
    WHERE tenant_id = $1 AND date >= $2::date AND date <= $3::date
    GROUP BY user_id
  `, [req.tenantId, from, to]);

  const daysMap = {};
  for (const d of daysWorked) {
    daysMap[d.user_id] = d.days_worked;
  }

  // 3. Продажи по цехам за период (из оплаченных заказов)
  const workshopRevenues = await all(`
    SELECT w.id as workshop_id, w.name,
      COALESCE(SUM(oi.total), 0) as revenue
    FROM workshops w
    LEFT JOIN categories c ON c.workshop_id = w.id
    LEFT JOIN products p ON p.category_id = c.id
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders o ON o.id = oi.order_id
      AND o.status = 'paid'
      AND o.tenant_id = $1
      AND o.closed_at::date >= $2::date
      AND o.closed_at::date <= $3::date
    WHERE w.tenant_id = $1 AND w.active = true
    GROUP BY w.id, w.name
    ORDER BY w.name
  `, [req.tenantId, from, to]);

  const revenueMap = {};
  for (const wr of workshopRevenues) {
    revenueMap[wr.workshop_id] = parseFloat(wr.revenue);
  }

  // 4. Цеховые ставки всех сотрудников
  const allRates = await all(`
    SELECT swr.user_id, swr.workshop_id, swr.percentage, w.name as workshop_name
    FROM salary_workshop_rates swr
    JOIN workshops w ON w.id = swr.workshop_id
    WHERE swr.tenant_id = $1
  `, [req.tenantId]);

  const ratesByUser = {};
  for (const r of allRates) {
    if (!ratesByUser[r.user_id]) ratesByUser[r.user_id] = [];
    ratesByUser[r.user_id].push(r);
  }

  // 5. Уже выплаченное за период
  const payouts = await all(`
    SELECT user_id, COALESCE(SUM(amount), 0) as total_paid
    FROM salary_payouts
    WHERE tenant_id = $1 AND period_from >= $2::date AND period_to <= $3::date
    GROUP BY user_id
  `, [req.tenantId, from, to]);

  const paidMap = {};
  for (const p of payouts) {
    paidMap[p.user_id] = parseFloat(p.total_paid);
  }

  // 6. Собираем результат
  const result = employees.map((emp) => {
    const dailyRate = parseFloat(emp.daily_rate);
    const days = daysMap[emp.user_id] || 0;
    const dailyTotal = days * dailyRate;

    const userRates = ratesByUser[emp.user_id] || [];
    const workshopBonuses = userRates.map((r) => {
      const revenue = revenueMap[r.workshop_id] || 0;
      const pct = parseFloat(r.percentage);
      const bonus = Math.round(revenue * pct) / 100;
      return {
        workshop_id: r.workshop_id,
        name: r.workshop_name,
        revenue,
        percentage: pct,
        bonus,
      };
    });

    const totalBonus = workshopBonuses.reduce((s, b) => s + b.bonus, 0);
    const totalSalary = dailyTotal + totalBonus;
    const totalPaid = paidMap[emp.user_id] || 0;

    return {
      user_id: emp.user_id,
      name: emp.name,
      days_worked: days,
      daily_rate: dailyRate,
      daily_total: dailyTotal,
      workshop_bonuses: workshopBonuses,
      total_bonus: totalBonus,
      total_salary: totalSalary,
      total_paid: totalPaid,
      remaining: totalSalary - totalPaid,
    };
  });

  res.json({
    period: { from, to },
    workshop_revenues: workshopRevenues.map((wr) => ({
      workshop_id: wr.workshop_id,
      name: wr.name,
      revenue: parseFloat(wr.revenue),
    })),
    employees: result,
  });
});

// ========== ВЫПЛАТЫ ==========

// GET /payouts?from=&to=&user_id=
router.get('/payouts', async (req, res) => {
  const { from, to, user_id } = req.query;
  let sql = `
    SELECT sp.*, u.name as user_name, pb.name as paid_by_name
    FROM salary_payouts sp
    JOIN users u ON u.id = sp.user_id
    LEFT JOIN users pb ON pb.id = sp.paid_by
    WHERE sp.tenant_id = $1
  `;
  const params = [req.tenantId];

  if (from) {
    params.push(from);
    sql += ` AND sp.created_at::date >= $${params.length}::date`;
  }
  if (to) {
    params.push(to);
    sql += ` AND sp.created_at::date <= $${params.length}::date`;
  }
  if (user_id) {
    params.push(user_id);
    sql += ` AND sp.user_id = $${params.length}`;
  }

  sql += ' ORDER BY sp.created_at DESC';

  const payouts = await all(sql, params);
  res.json(payouts.map((p) => ({
    ...p,
    amount: parseFloat(p.amount),
  })));
});

// POST /payouts — создать выплату
router.post('/payouts', async (req, res) => {
  const { user_id, amount, period_from, period_to, note } = req.body;
  if (!user_id || !amount || !period_from || !period_to) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
  }

  const result = await run(`
    INSERT INTO salary_payouts (user_id, tenant_id, amount, period_from, period_to, note, paid_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [user_id, req.tenantId, amount, period_from, period_to, note || null, req.user.id]);

  res.json({ id: result.id });
});

// DELETE /payouts/:id — удалить выплату
router.delete('/payouts/:id', async (req, res) => {
  const payout = await get(
    'SELECT id FROM salary_payouts WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!payout) return res.status(404).json({ error: 'Выплата не найдена' });

  await run(
    'DELETE FROM salary_payouts WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  res.json({ success: true });
});

module.exports = router;
