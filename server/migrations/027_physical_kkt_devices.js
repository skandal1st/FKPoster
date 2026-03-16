const { run } = require('../db');

async function up() {
  // 1. Таблица физических ККТ-устройств (bridge-агенты)
  await run(`
    CREATE TABLE IF NOT EXISTS kkt_physical_devices (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      device_id VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL DEFAULT 'ККТ-устройство',
      platform VARCHAR(20) NOT NULL CHECK (platform IN ('android', 'windows', 'ios', 'linux')),
      status VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
      atol_model VARCHAR(100),
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_kkt_physical_devices_tenant ON kkt_physical_devices(tenant_id)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_kkt_physical_devices_device_id ON kkt_physical_devices(device_id)`);

  // 2. Токены-приглашения для привязки устройства из веб-админки
  await run(`
    CREATE TABLE IF NOT EXISTS kkt_pairing_tokens (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      token VARCHAR(64) NOT NULL UNIQUE,
      device_name VARCHAR(200),
      used BOOLEAN DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_kkt_pairing_tokens_tenant ON kkt_pairing_tokens(tenant_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_kkt_pairing_tokens_token ON kkt_pairing_tokens(token)`);

  // 3. Очередь фискальных чеков для физических ККТ
  await run(`
    CREATE TABLE IF NOT EXISTS kkt_physical_queue (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      order_id INTEGER REFERENCES orders(id),
      device_id VARCHAR(100) REFERENCES kkt_physical_devices(device_id) ON DELETE SET NULL,
      receipt_type VARCHAR(20) NOT NULL DEFAULT 'sell' CHECK (receipt_type IN ('sell', 'sell_return', 'open_shift', 'close_shift', 'x_report')),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'done', 'error')),
      receipt_data JSONB NOT NULL DEFAULT '{}',
      fiscal_number VARCHAR(100),
      fiscal_document_number VARCHAR(100),
      fiscal_sign VARCHAR(100),
      fiscal_datetime TIMESTAMPTZ,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_kkt_physical_queue_tenant ON kkt_physical_queue(tenant_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_kkt_physical_queue_device ON kkt_physical_queue(device_id, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_kkt_physical_queue_status ON kkt_physical_queue(tenant_id, status)`);

  // 4. Добавить физический тип в tenant_integrations
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_physical_enabled BOOLEAN DEFAULT FALSE`);

  console.log('Migration 027_physical_kkt_devices complete');
}

module.exports = { up };
