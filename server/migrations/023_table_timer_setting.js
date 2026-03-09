const { run } = require('../db');

async function up() {
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS show_table_timer BOOLEAN DEFAULT true`);
  await run(`ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS kkt_environment VARCHAR(20) DEFAULT 'production'`);
  console.log('Migration 023_table_timer_setting complete');
}

module.exports = { up };
