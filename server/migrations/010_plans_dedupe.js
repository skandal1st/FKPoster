const { pool } = require('../db');

/**
 * Удаляет дубликаты планов (оставляет один план на каждое имя с минимальным id),
 * обновляет подписки на оставшиеся id, добавляет UNIQUE(name) в plans.
 */
async function up() {
  const client = await pool.connect();
  try {
    const dupes = await client.query(`
      SELECT name, array_agg(id ORDER BY id) as ids
      FROM plans
      GROUP BY name
      HAVING COUNT(*) > 1
    `);

    for (const row of dupes.rows) {
      const ids = row.ids;
      const keepId = ids[0];
      const removeIds = ids.slice(1);
      for (const oldId of removeIds) {
        await client.query('UPDATE subscriptions SET plan_id = $1 WHERE plan_id = $2', [keepId, oldId]);
        await client.query('DELETE FROM plans WHERE id = $1', [oldId]);
      }
    }

    const hasConstraint = await client.query(
      "SELECT 1 FROM pg_constraint WHERE conname = 'plans_name_unique'"
    );
    if (hasConstraint.rows.length === 0) {
      await client.query('ALTER TABLE plans ADD CONSTRAINT plans_name_unique UNIQUE (name)');
    }
    console.log('Migration 010: Plans deduplicated, UNIQUE(name) added');
  } finally {
    client.release();
  }
}

module.exports = { up };
