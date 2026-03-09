const { run } = require('../db');

async function up() {
  // 1. KKT-настройки на tenant_integrations
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_enabled BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_provider VARCHAR(20)`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_strict_mode BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_default_vat VARCHAR(10) DEFAULT 'none'`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_group_code VARCHAR(50)`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_login VARCHAR(255)`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_password TEXT`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_inn VARCHAR(12)`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_payment_address TEXT`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_sno VARCHAR(30)`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_callback_url TEXT`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_token TEXT`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_token_expires_at TIMESTAMP`);

  // 2. НДС на товарах
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_rate VARCHAR(10) DEFAULT NULL`);

  // 3. Таблица чеков ККТ
  await run(`
    CREATE TABLE IF NOT EXISTS kkt_receipts (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      external_uuid VARCHAR(100),
      receipt_type VARCHAR(20) DEFAULT 'sell',
      status VARCHAR(20) DEFAULT 'pending',
      fiscal_number VARCHAR(50),
      fiscal_document VARCHAR(50),
      fiscal_sign VARCHAR(50),
      registration_number VARCHAR(50),
      fn_number VARCHAR(50),
      receipt_datetime TIMESTAMP,
      total NUMERIC(12,2),
      payment_method VARCHAR(20),
      kkt_provider VARCHAR(20),
      request_payload JSONB,
      response_payload JSONB,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_kkt_receipts_tenant ON kkt_receipts(tenant_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_kkt_receipts_order ON kkt_receipts(order_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_kkt_receipts_status ON kkt_receipts(tenant_id, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_kkt_receipts_uuid ON kkt_receipts(external_uuid)`);

  // 4. Feature gating: добавить 'kkt' в features для Бизнес и Pro планов
  await run(`
    UPDATE plans SET features = features || '{"kkt": true}'::jsonb
    WHERE features IS NOT NULL AND features::text != 'null'
      AND LOWER(name) IN ('pro', 'бизнес', 'business')
  `);

  console.log('Migration 022_kkt_integration complete');
}

module.exports = { up };
