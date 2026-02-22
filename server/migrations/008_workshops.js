const { pool } = require('../db');

async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workshops (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      name VARCHAR(255) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE categories ADD COLUMN IF NOT EXISTS workshop_id INTEGER REFERENCES workshops(id);
    CREATE INDEX IF NOT EXISTS idx_categories_workshop_id ON categories(workshop_id);
  `);

  console.log('Migration 008: Added workshops table and workshop_id to categories');
}

module.exports = { up };
