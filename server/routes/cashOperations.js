const express = require('express');
const { all, get, run, transaction } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, checkSubscription);

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Список операций за смену (admin+) */
router.get('/', adminOnly, wrap(async (req, res) => {
  const { register_day_id } = req.query;
  if (!register_day_id) return res.status(400).json({ error: 'Укажите register_day_id' });

  // Проверить, что смена принадлежит этому тенанту
  const day = await get('SELECT id FROM register_days WHERE id = $1 AND tenant_id = $2', [register_day_id, req.tenantId]);
  if (!day) return res.status(404).json({ error: 'Смена не найдена' });

  const ops = await all(
    `SELECT co.*, u.name as user_name
     FROM cash_operations co
     LEFT JOIN users u ON co.user_id = u.id
     WHERE co.register_day_id = $1 AND co.tenant_id = $2
     ORDER BY co.created_at DESC`,
    [register_day_id, req.tenantId]
  );
  for (const op of ops) op.amount = parseFloat(op.amount);
  res.json(ops);
}));

/** Создать операцию (все аутентифицированные, включая кассира) */
router.post('/', wrap(async (req, res) => {
  const { description, amount, payment_type, type = 'expense' } = req.body;

  const desc = typeof description === 'string' ? description.trim() : '';
  if (!desc) return res.status(400).json({ error: 'Описание обязательно' });

  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Сумма должна быть больше нуля' });

  if (!['cash', 'card'].includes(payment_type)) {
    return res.status(400).json({ error: 'Укажите тип оплаты: наличные или карта' });
  }
  if (!['expense', 'income'].includes(type)) {
    return res.status(400).json({ error: 'Недопустимый тип операции' });
  }

  // Найти открытую смену тенанта
  const day = await get("SELECT id FROM register_days WHERE status = 'open' AND tenant_id = $1 ORDER BY id DESC LIMIT 1", [req.tenantId]);
  if (!day) return res.status(400).json({ error: 'Кассовый день не открыт' });

  let newOp;
  await transaction(async (tx) => {
    const result = await tx.run(
      `INSERT INTO cash_operations (tenant_id, register_day_id, user_id, type, payment_type, amount, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.tenantId, day.id, req.user.id, type, payment_type, amt, desc]
    );

    // Обновить итоги по расходам в register_days
    if (type === 'expense') {
      await tx.run(
        `UPDATE register_days SET
          total_expenses_cash = total_expenses_cash + CASE WHEN $1 = 'cash' THEN $2 ELSE 0 END,
          total_expenses_card = total_expenses_card + CASE WHEN $1 = 'card' THEN $2 ELSE 0 END
         WHERE id = $3`,
        [payment_type, amt, day.id]
      );
    }

    newOp = await tx.get(
      `SELECT co.*, u.name as user_name FROM cash_operations co LEFT JOIN users u ON co.user_id = u.id WHERE co.id = $1`,
      [result.id]
    );
  });

  newOp.amount = parseFloat(newOp.amount);
  res.status(201).json(newOp);
}));

/** Удалить операцию (admin+) */
router.delete('/:id', adminOnly, wrap(async (req, res) => {
  const op = await get(
    'SELECT co.*, rd.status as day_status FROM cash_operations co JOIN register_days rd ON co.register_day_id = rd.id WHERE co.id = $1 AND co.tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!op) return res.status(404).json({ error: 'Операция не найдена' });
  if (op.day_status === 'closed') {
    return res.status(400).json({ error: 'Нельзя удалить операцию из закрытой смены' });
  }

  const amt = parseFloat(op.amount);
  await transaction(async (tx) => {
    await tx.run('DELETE FROM cash_operations WHERE id = $1', [op.id]);

    if (op.type === 'expense') {
      await tx.run(
        `UPDATE register_days SET
          total_expenses_cash = GREATEST(0, total_expenses_cash - CASE WHEN $1 = 'cash' THEN $2 ELSE 0 END),
          total_expenses_card = GREATEST(0, total_expenses_card - CASE WHEN $1 = 'card' THEN $2 ELSE 0 END)
         WHERE id = $3`,
        [op.payment_type, amt, op.register_day_id]
      );
    }
  });

  res.json({ ok: true });
}));

module.exports = router;
