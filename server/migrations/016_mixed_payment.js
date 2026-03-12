const { run } = require('../db');

exports.up = async () => {
  // Добавить колонки paid_cash и paid_card
  await run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_cash NUMERIC(12,2) DEFAULT 0`);
  await run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_card NUMERIC(12,2) DEFAULT 0`);

  // Убрать старый CHECK constraint (если есть) и добавить новый с 'mixed'
  await run(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check`);
  await run(`ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cash', 'card', 'mixed', 'delivery'))`);

  // Бэкфилл: для закрытых заказов проставить paid_cash/paid_card по payment_method
  await run(`UPDATE orders SET paid_cash = total WHERE payment_method = 'cash' AND status = 'closed' AND (paid_cash IS NULL OR paid_cash = 0)`);
  await run(`UPDATE orders SET paid_card = total WHERE payment_method = 'card' AND status = 'closed' AND (paid_card IS NULL OR paid_card = 0)`);

  console.log('016_mixed_payment: done');
};
