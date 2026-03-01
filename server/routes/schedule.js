const express = require('express');
const { all, run, transaction } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription, adminOnly);

// GET / — все записи графика за месяц
router.get('/', async (req, res) => {
  const { month } = req.query; // формат: 2026-03
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Укажите месяц в формате YYYY-MM' });
  }

  const from = `${month}-01`;
  const to = `${month}-01`;

  const schedule = await all(`
    SELECT ws.id, ws.user_id, ws.date, u.name as user_name
    FROM work_schedule ws
    JOIN users u ON u.id = ws.user_id
    WHERE ws.tenant_id = $1
      AND ws.date >= $2::date
      AND ws.date < ($3::date + INTERVAL '1 month')
    ORDER BY ws.date, u.name
  `, [req.tenantId, from, to]);

  res.json(schedule);
});

// POST / — добавить сотрудника на дату
router.post('/', async (req, res) => {
  const { user_id, date } = req.body;
  if (!user_id || !date) {
    return res.status(400).json({ error: 'Укажите сотрудника и дату' });
  }

  const result = await run(`
    INSERT INTO work_schedule (user_id, tenant_id, date)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, date, tenant_id) DO NOTHING
    RETURNING id
  `, [user_id, req.tenantId, date]);

  res.json({ id: result.id, user_id, date });
});

// DELETE /:id — убрать сотрудника с даты
router.delete('/:id', async (req, res) => {
  await run(
    'DELETE FROM work_schedule WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  res.json({ success: true });
});

// POST /bulk — массовое обновление за месяц
router.post('/bulk', async (req, res) => {
  const { entries, month } = req.body; // entries: [{ user_id, date }], month: "2026-03"
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Укажите месяц в формате YYYY-MM' });
  }

  const from = `${month}-01`;

  await transaction(async (tx) => {
    // Удалить все записи за месяц
    await tx.run(`
      DELETE FROM work_schedule
      WHERE tenant_id = $1
        AND date >= $2::date
        AND date < ($2::date + INTERVAL '1 month')
    `, [req.tenantId, from]);

    // Вставить новые
    if (entries && entries.length > 0) {
      for (const entry of entries) {
        await tx.run(`
          INSERT INTO work_schedule (user_id, tenant_id, date)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, date, tenant_id) DO NOTHING
        `, [entry.user_id, req.tenantId, entry.date]);
      }
    }
  });

  res.json({ success: true });
});

module.exports = router;
