const { run } = require('../db');

exports.up = async () => {
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30)`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
  console.log('Migration 020: phone + city columns added');
};
