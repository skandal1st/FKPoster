const { run } = require('../db');

async function up() {
  // Добавить колонки расходов в register_days
  await run(`ALTER TABLE register_days ADD COLUMN IF NOT EXISTS total_expenses_cash NUMERIC(12,2) NOT NULL DEFAULT 0`);
  await run(`ALTER TABLE register_days ADD COLUMN IF NOT EXISTS total_expenses_card NUMERIC(12,2) NOT NULL DEFAULT 0`);

  // Создать таблицу кассовых операций (расходы/приходы)
  await run(`
    CREATE TABLE IF NOT EXISTS cash_operations (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      register_day_id INTEGER NOT NULL REFERENCES register_days(id) ON DELETE CASCADE,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      type            VARCHAR(20) NOT NULL DEFAULT 'expense'
                        CHECK (type IN ('expense', 'income')),
      payment_type    VARCHAR(20) NOT NULL
                        CHECK (payment_type IN ('cash', 'card')),
      amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      description     TEXT NOT NULL,
      created_at      TIMESTAMP DEFAULT NOW()
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_cash_ops_tenant
    ON cash_operations(tenant_id, register_day_id)
  `);
}

module.exports = { up };
