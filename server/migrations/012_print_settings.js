const { run } = require('../db');

async function up() {
  await run(`
    CREATE TABLE IF NOT EXISTS tenant_print_settings (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      receipt_width VARCHAR(10) NOT NULL DEFAULT '80mm',
      receipt_header TEXT NOT NULL DEFAULT '',
      receipt_footer TEXT NOT NULL DEFAULT 'Спасибо за визит!',
      auto_print_receipt BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(tenant_id)
    )
  `);

  console.log('Migration 012_print_settings complete');
}

module.exports = { up };
