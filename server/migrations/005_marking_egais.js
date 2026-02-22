const { pool } = require('../db');

async function up() {
  await pool.query(`
    -- Новые колонки в products для маркировки
    ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(50);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS marking_type VARCHAR(20) NOT NULL DEFAULT 'none';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS egais_alcocode VARCHAR(64);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS tobacco_gtin VARCHAR(14);

    -- Настройки интеграций тенанта
    CREATE TABLE IF NOT EXISTS tenant_integrations (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      -- ЕГАИС
      egais_enabled BOOLEAN NOT NULL DEFAULT false,
      egais_utm_host VARCHAR(255) DEFAULT 'localhost',
      egais_utm_port INTEGER DEFAULT 8080,
      egais_fsrar_id VARCHAR(20),
      -- Честный знак
      chestniy_znak_enabled BOOLEAN NOT NULL DEFAULT false,
      chestniy_znak_token TEXT,
      chestniy_znak_omsid VARCHAR(64),
      chestniy_znak_environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(tenant_id)
    );

    -- Маркированные единицы
    CREATE TABLE IF NOT EXISTS marked_items (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      product_id INTEGER REFERENCES products(id),
      marking_code TEXT NOT NULL,
      marking_type VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'received',
      -- ЕГАИС
      egais_form_a_reg_id VARCHAR(64),
      egais_form_b_reg_id VARCHAR(64),
      egais_fsm VARCHAR(150),
      -- Табак
      tobacco_cis TEXT,
      tobacco_gtin VARCHAR(14),
      tobacco_serial VARCHAR(30),
      tobacco_mrp NUMERIC(12,2),
      -- Привязки
      supply_id INTEGER REFERENCES supplies(id),
      order_id INTEGER REFERENCES orders(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_marked_items_tenant ON marked_items(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_marked_items_status ON marked_items(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_marked_items_code ON marked_items(marking_code);

    -- Журнал ЕГАИС-документов
    CREATE TABLE IF NOT EXISTS egais_documents (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      doc_type VARCHAR(50) NOT NULL,
      direction VARCHAR(20) NOT NULL DEFAULT 'outgoing',
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      xml_content TEXT,
      summary JSONB DEFAULT '{}',
      external_id VARCHAR(100),
      reply_id VARCHAR(100),
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_egais_docs_tenant ON egais_documents(tenant_id);

    -- Кеш остатков ЕГАИС (Регистр 1/2)
    CREATE TABLE IF NOT EXISTS egais_stock (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      register_type VARCHAR(10) NOT NULL DEFAULT 'reg1',
      egais_alcocode VARCHAR(64) NOT NULL,
      product_name VARCHAR(255),
      quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      inform_a_reg_id VARCHAR(64),
      inform_b_reg_id VARCHAR(64),
      last_synced_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_egais_stock_tenant ON egais_stock(tenant_id, register_type);

    -- Лог операций Честного знака
    CREATE TABLE IF NOT EXISTS chestniy_znak_operations (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      operation_type VARCHAR(30) NOT NULL,
      marking_codes TEXT[],
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      request_body JSONB,
      response_body JSONB,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_cz_ops_tenant ON chestniy_znak_operations(tenant_id);

    -- Расширение supply_items для маркировки
    ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS marking_type VARCHAR(20) NOT NULL DEFAULT 'none';
    ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS marked_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS expected_marked_count INTEGER NOT NULL DEFAULT 0;

    -- Расширение order_items для маркировки
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS marking_type VARCHAR(20) NOT NULL DEFAULT 'none';
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS marked_codes_scanned INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS marked_codes_required INTEGER NOT NULL DEFAULT 0;
  `);

  console.log('Migration 005: Marking & EGAIS tables created');
}

module.exports = { up };
