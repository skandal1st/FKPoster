const { run } = require('../db');

async function up() {
  // 1.1 Реквизиты юрлица на tenants
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legal_name VARCHAR(500)`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS inn VARCHAR(12)`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS kpp VARCHAR(9)`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ogrn VARCHAR(15)`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legal_address TEXT`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS actual_address TEXT`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS director_name VARCHAR(255)`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255)`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_bik VARCHAR(9)`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_account VARCHAR(20)`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_corr_account VARCHAR(20)`);

  // 1.2 ЭДО-настройки на tenant_integrations
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS edo_enabled BOOLEAN DEFAULT false`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS edo_provider VARCHAR(20)`);
  // СБИС
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS edo_sbis_login VARCHAR(255)`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS edo_sbis_password TEXT`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS edo_sbis_app_client_id VARCHAR(255)`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS edo_sbis_app_secret TEXT`);
  // Диадок
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS edo_diadoc_api_key TEXT`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS edo_diadoc_login VARCHAR(255)`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS edo_diadoc_password TEXT`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS edo_diadoc_box_id VARCHAR(100)`);

  // 1.3 Контрагенты
  await run(`
    CREATE TABLE IF NOT EXISTS counterparties (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(500) NOT NULL,
      inn VARCHAR(12),
      kpp VARCHAR(9),
      legal_address TEXT,
      edo_id VARCHAR(255),
      egais_fsrar_id VARCHAR(20),
      phone VARCHAR(20),
      email VARCHAR(255),
      note TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_counterparties_tenant ON counterparties(tenant_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_counterparties_inn ON counterparties(inn)`);

  // 1.4 Журнал ЭДО-документов
  await run(`
    CREATE TABLE IF NOT EXISTS edo_documents (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      doc_type VARCHAR(50) NOT NULL,
      doc_number VARCHAR(100),
      doc_date DATE,
      direction VARCHAR(20) DEFAULT 'incoming',
      status VARCHAR(30) DEFAULT 'draft',
      edo_provider VARCHAR(20),
      external_doc_id VARCHAR(255),
      counterparty_id INTEGER REFERENCES counterparties(id),
      counterparty_inn VARCHAR(12),
      total_without_vat NUMERIC(14,2),
      vat_amount NUMERIC(14,2),
      total_with_vat NUMERIC(14,2),
      supply_id INTEGER,
      egais_document_id INTEGER,
      items JSONB DEFAULT '[]',
      raw_content TEXT,
      error_message TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_edo_documents_tenant ON edo_documents(tenant_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_edo_documents_status ON edo_documents(tenant_id, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_edo_documents_type ON edo_documents(tenant_id, doc_type)`);

  // 1.5 Межзаведенческие перемещения
  await run(`
    CREATE TABLE IF NOT EXISTS chain_transfers (
      id SERIAL PRIMARY KEY,
      chain_id INTEGER NOT NULL REFERENCES chains(id),
      from_tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      to_tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      status VARCHAR(30) DEFAULT 'draft',
      transfer_number VARCHAR(50),
      has_alcohol BOOLEAN DEFAULT false,
      egais_ttn_id INTEGER,
      edo_document_id INTEGER,
      note TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_chain_transfers_chain ON chain_transfers(chain_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_chain_transfers_from ON chain_transfers(from_tenant_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_chain_transfers_to ON chain_transfers(to_tenant_id)`);

  await run(`
    CREATE TABLE IF NOT EXISTS chain_transfer_items (
      id SERIAL PRIMARY KEY,
      transfer_id INTEGER NOT NULL REFERENCES chain_transfers(id) ON DELETE CASCADE,
      product_id INTEGER,
      product_name VARCHAR(500) NOT NULL,
      quantity NUMERIC(12,3) NOT NULL,
      unit VARCHAR(20) DEFAULT 'шт',
      unit_cost NUMERIC(12,2),
      egais_alcocode VARCHAR(64),
      received_quantity NUMERIC(12,3)
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_chain_transfer_items_transfer ON chain_transfer_items(transfer_id)`);

  // 1.6 Расширение supplies
  await run(`ALTER TABLE supplies ADD COLUMN IF NOT EXISTS counterparty_id INTEGER REFERENCES counterparties(id)`);
  await run(`ALTER TABLE supplies ADD COLUMN IF NOT EXISTS edo_document_id INTEGER`);
  await run(`ALTER TABLE supplies ADD COLUMN IF NOT EXISTS egais_document_id INTEGER`);
  await run(`ALTER TABLE supplies ADD COLUMN IF NOT EXISTS chain_transfer_id INTEGER`);

  // Feature gating: добавить 'edo' в features для pro и business планов
  await run(`
    UPDATE plans SET features = features || '{"edo": true}'::jsonb
    WHERE features IS NOT NULL AND features::text != 'null'
      AND (LOWER(name) IN ('pro', 'business') OR LOWER(code) IN ('pro', 'business'))
  `);

  console.log('Migration 021_edo_integration complete');
}

module.exports = { up };
