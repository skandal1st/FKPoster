const express = require('express');
const { all, get, run, transaction } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription, adminOnly);

// ========== РЕЖИМ РАБОТЫ ==========

// GET /day-end — конец рабочего дня
router.get('/day-end', async (req, res) => {
  try {
    const tenant = await get('SELECT day_end_hour FROM tenants WHERE id = $1', [req.tenantId]);
    res.json({ day_end_hour: parseInt(tenant?.day_end_hour) || 0 });
  } catch {
    res.json({ day_end_hour: 0 });
  }
});

// PUT /day-end — обновить конец рабочего дня
router.put('/day-end', async (req, res) => {
  const { day_end_hour } = req.body;
  const hour = Math.max(0, Math.min(12, parseInt(day_end_hour) || 0));
  await run('UPDATE tenants SET day_end_hour = $1 WHERE id = $2', [hour, req.tenantId]);
  res.json({ day_end_hour: hour });
});

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

  // 0. Получить настройку конца рабочего дня (безопасно — колонка может не существовать)
  let dayEndHour = 0;
  try {
    const tenant = await get('SELECT day_end_hour FROM tenants WHERE id = $1', [req.tenantId]);
    dayEndHour = parseInt(tenant?.day_end_hour) || 0;
  } catch {
    dayEndHour = 0;
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

  // 2. Даты смен каждого сотрудника за период
  const scheduleRows = await all(`
    SELECT user_id, to_char(date, 'YYYY-MM-DD') as date
    FROM work_schedule
    WHERE tenant_id = $1 AND date >= $2::date AND date <= $3::date
    ORDER BY date
  `, [req.tenantId, from, to]);

  // scheduleByUser: { userId: Set<"YYYY-MM-DD"> }
  const scheduleByUser = {};
  const daysMap = {};
  for (const row of scheduleRows) {
    if (!scheduleByUser[row.user_id]) scheduleByUser[row.user_id] = new Set();
    scheduleByUser[row.user_id].add(row.date);
    daysMap[row.user_id] = (daysMap[row.user_id] || 0) + 1;
  }

  // 3. Продажи по цехам и ДНЯМ за период (из оплаченных заказов)
  // day_end_hour сдвигает границу дня: заказ в 01:30 при day_end_hour=2 считается за предыдущий день
  const dailyWorkshopRevenues = await all(`
    SELECT
      to_char((o.closed_at - INTERVAL '1 hour' * $4)::date, 'YYYY-MM-DD') as work_date,
      w.id as workshop_id,
      w.name as workshop_name,
      COALESCE(SUM(oi.total), 0) as revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON oi.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    JOIN workshops w ON c.workshop_id = w.id
    WHERE o.status = 'paid'
      AND o.tenant_id = $1
      AND w.tenant_id = $1
      AND (o.closed_at - INTERVAL '1 hour' * $4)::date >= $2::date
      AND (o.closed_at - INTERVAL '1 hour' * $4)::date <= $3::date
    GROUP BY work_date, w.id, w.name
    ORDER BY work_date, w.name
  `, [req.tenantId, from, to, dayEndHour]);

  // dailyRevMap: { "YYYY-MM-DD": { workshopId: revenue } }
  const dailyRevMap = {};
  // totalRevenueByWorkshop: { workshopId: { name, revenue } } — для итогов
  const totalRevenueByWorkshop = {};
  for (const row of dailyWorkshopRevenues) {
    const wid = row.workshop_id;
    const rev = parseFloat(row.revenue);

    if (!dailyRevMap[row.work_date]) dailyRevMap[row.work_date] = {};
    dailyRevMap[row.work_date][wid] = rev;

    if (!totalRevenueByWorkshop[wid]) totalRevenueByWorkshop[wid] = { name: row.workshop_name, revenue: 0 };
    totalRevenueByWorkshop[wid].revenue += rev;
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

  // 6. Собираем результат — процент начисляется только за дни, когда сотрудник на смене
  const result = employees.map((emp) => {
    const dailyRate = parseFloat(emp.daily_rate);
    const days = daysMap[emp.user_id] || 0;
    const dailyTotal = days * dailyRate;
    const userScheduleDays = scheduleByUser[emp.user_id] || new Set();

    const userRates = ratesByUser[emp.user_id] || [];

    // Для каждого цеха суммируем выручку только тех дней, когда сотрудник был на смене
    const workshopBonuses = userRates.map((r) => {
      const wid = r.workshop_id;
      const pct = parseFloat(r.percentage);
      let revenueOnShift = 0;
      for (const day of userScheduleDays) {
        revenueOnShift += (dailyRevMap[day] && dailyRevMap[day][wid]) || 0;
      }
      const bonus = Math.round(revenueOnShift * pct) / 100;
      return {
        workshop_id: wid,
        name: r.workshop_name,
        revenue: revenueOnShift,
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

  // Итоги по цехам (общая выручка за весь период)
  const workshopRevenues = Object.entries(totalRevenueByWorkshop).map(([wid, data]) => ({
    workshop_id: parseInt(wid),
    name: data.name,
    revenue: data.revenue,
  }));

  res.json({
    period: { from, to },
    workshop_revenues: workshopRevenues,
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
