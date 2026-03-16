const { run } = require('../db');

async function up() {
  // Добавить поля для фискальных данных физической ККТ в таблицу orders
  await run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fiscal_number VARCHAR(50)`);
  await run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fiscal_document_number VARCHAR(50)`);
  await run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fiscal_sign VARCHAR(50)`);

  console.log('Migration 028_orders_fiscal_fields complete');
}

module.exports = { up };
