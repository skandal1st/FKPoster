const { run } = require('../db');

exports.up = async () => {
  await run(`ALTER TABLE tables ADD COLUMN IF NOT EXISTS label VARCHAR(50) DEFAULT NULL`);
  console.log('Migration 013: table labels — done');
};
