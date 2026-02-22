const { pool } = require('../db');

async function up() {
  await pool.query(`
    -- Гости (программа лояльности)
    CREATE TABLE IF NOT EXISTS guests (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      -- Тип скидки: percent — процент, fixed — фиксированная сумма в рублях
      discount_type VARCHAR(20) NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
      discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
      -- Бонусный баланс (для бонусных карт, можно списывать при оплате)
      bonus_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_guests_tenant ON guests(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_guests_phone ON guests(tenant_id, phone) WHERE phone IS NOT NULL;

    -- Привязка заказа к гостю и сумма скидки
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_id INTEGER REFERENCES guests(id);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_before_discount NUMERIC(12,2);

    CREATE INDEX IF NOT EXISTS idx_orders_guest ON orders(guest_id) WHERE guest_id IS NOT NULL;
  `);

  console.log('Migration 006: Guests and loyalty schema created');
}

module.exports = { up };
