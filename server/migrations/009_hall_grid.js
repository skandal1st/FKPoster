const { pool } = require('../db');

async function up() {
  await pool.query(`
    ALTER TABLE halls ADD COLUMN IF NOT EXISTS grid_cols INTEGER NOT NULL DEFAULT 6;
    ALTER TABLE halls ADD COLUMN IF NOT EXISTS grid_rows INTEGER NOT NULL DEFAULT 4;
    ALTER TABLE tables ADD COLUMN IF NOT EXISTS grid_x INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE tables ADD COLUMN IF NOT EXISTS grid_y INTEGER NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    UPDATE tables t
    SET grid_x = GREATEST(0, LEAST(h.grid_cols - 1, FLOOR(COALESCE(t.x, 10) / 100.0 * h.grid_cols))),
        grid_y = GREATEST(0, LEAST(h.grid_rows - 1, FLOOR(COALESCE(t.y, 10) / 100.0 * h.grid_rows)))
    FROM halls h
    WHERE h.id = t.hall_id;
  `);
  console.log('Migration 009: Hall grid columns added');
}

module.exports = { up };
