const { run } = require('../db');

async function up() {
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS show_table_timer BOOLEAN DEFAULT true`);
  console.log('Migration 023_table_timer_setting complete');
}

module.exports = { up };
