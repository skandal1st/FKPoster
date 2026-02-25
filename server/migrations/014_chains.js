const { run } = require('../db');

exports.up = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS chains (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS chain_tenants (
      id SERIAL PRIMARY KEY,
      chain_id INTEGER NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      added_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(chain_id, tenant_id)
    )
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_chain_tenants_chain ON chain_tenants(chain_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_chain_tenants_tenant ON chain_tenants(tenant_id)`);

  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS chain_id INTEGER REFERENCES chains(id)`);

  await run(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await run(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('owner','admin','cashier','superadmin','chain_owner'))
  `);

  console.log('Migration 014: chains — done');
};
