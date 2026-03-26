const { run } = require('../db');

async function up() {
  // Таблица уровней бонусной программы (настраивается на уровне тенанта)
  await run(`
    CREATE TABLE IF NOT EXISTS loyalty_tiers (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      min_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
      bonus_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_tenant
    ON loyalty_tiers(tenant_id, min_spent)
  `);

  // Добавить поля в guests (IF NOT EXISTS — идемпотентно)
  await run(`ALTER TABLE guests ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12,2) NOT NULL DEFAULT 0`);
  await run(`ALTER TABLE guests ADD COLUMN IF NOT EXISTS visits_count INTEGER NOT NULL DEFAULT 0`);
  await run(`ALTER TABLE guests ADD COLUMN IF NOT EXISTS bonus_rate_override NUMERIC(5,2) DEFAULT NULL`);

  // Добавить поля в orders для фиксации начисленных/списанных бонусов
  await run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_earned NUMERIC(12,2) NOT NULL DEFAULT 0`);
  await run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_used NUMERIC(12,2) NOT NULL DEFAULT 0`);
}

module.exports = { up };
