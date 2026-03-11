const { run } = require('../db');

exports.up = async function () {
  // Ключ идемпотентности для дедупликации офлайн-заказов
  await run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency ON orders (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`);
};
