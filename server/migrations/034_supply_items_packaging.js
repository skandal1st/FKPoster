const { run } = require('../db');

async function up() {
  await run(`ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS package_size NUMERIC(12,4)`);
  await run(`ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS package_price NUMERIC(12,2)`);
  await run(`ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS package_qty NUMERIC(12,4)`);
}

module.exports = { up };
