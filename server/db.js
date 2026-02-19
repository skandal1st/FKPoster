const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

async function getDb() {
  const client = await pool.connect();
  client.release();
  return pool;
}

async function run(sql, params = []) {
  const result = await pool.query(sql, params);
  return {
    rowCount: result.rowCount,
    rows: result.rows,
    id: result.rows[0]?.id ?? null,
  };
}

async function all(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function get(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const helpers = {
      run: async (sql, params = []) => {
        const result = await client.query(sql, params);
        return { rowCount: result.rowCount, rows: result.rows, id: result.rows[0]?.id ?? null };
      },
      all: async (sql, params = []) => {
        const result = await client.query(sql, params);
        return result.rows;
      },
      get: async (sql, params = []) => {
        const result = await client.query(sql, params);
        return result.rows[0] || null;
      },
    };
    const result = await callback(helpers);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getDb, run, all, get, transaction, pool };
