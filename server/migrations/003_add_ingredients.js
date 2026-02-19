const { pool } = require('../db');

async function up() {
  await pool.query(`
    -- Add is_ingredient field to products
    ALTER TABLE products ADD COLUMN IF NOT EXISTS is_ingredient BOOLEAN NOT NULL DEFAULT false;
    
    -- Create index for faster filtering
    CREATE INDEX IF NOT EXISTS idx_products_is_ingredient ON products(is_ingredient) WHERE is_ingredient = true;
  `);

  console.log('Migration 003: Added is_ingredient field to products');
}

module.exports = { up };
