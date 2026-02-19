const { pool } = require('../db');

async function up() {
  await pool.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','admin','cashier','superadmin'));
  `);
  console.log('Migration 004: superadmin role added');
}

module.exports = { up };
