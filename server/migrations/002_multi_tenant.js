const { pool } = require('../db');

async function up() {
  await pool.query(`
    -- Tenants (companies)
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      logo_url TEXT,
      accent_color VARCHAR(7) DEFAULT '#6366f1',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Plans
    CREATE TABLE IF NOT EXISTS plans (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      price NUMERIC(10,2) DEFAULT 0,
      max_users INTEGER DEFAULT 3,
      max_halls INTEGER DEFAULT 1,
      max_products INTEGER DEFAULT 50,
      features JSONB DEFAULT '{}',
      active BOOLEAN DEFAULT true
    );

    -- Subscriptions
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active','trialing','past_due','cancelled','expired')),
      current_period_start TIMESTAMP DEFAULT NOW(),
      current_period_end TIMESTAMP NOT NULL,
      cancelled_at TIMESTAMP
    );

    -- Invitations
    CREATE TABLE IF NOT EXISTS invitations (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'cashier',
      token VARCHAR(255) UNIQUE NOT NULL,
      accepted BOOLEAN DEFAULT false,
      expires_at TIMESTAMP NOT NULL,
      created_by INTEGER REFERENCES users(id)
    );

    -- Add tenant_id to existing tables
    ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

    ALTER TABLE halls ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
    ALTER TABLE tables ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
    ALTER TABLE supplies ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
    ALTER TABLE register_days ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
    ALTER TABLE inventories ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);

    -- Update users role constraint to include 'owner'
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','admin','cashier'));

    -- Indexes for tenant_id
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_halls_tenant ON halls(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tables_tenant ON tables(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_supplies_tenant ON supplies(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_register_days_tenant ON register_days(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_inventories_tenant ON inventories(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);

    -- Default plans
    INSERT INTO plans (name, price, max_users, max_halls, max_products, features)
    VALUES
      ('free', 0, 2, 1, 30, '{"basic": true}'),
      ('basic', 990, 5, 3, 200, '{"basic": true, "reports": true}'),
      ('pro', 2490, 20, 10, 1000, '{"basic": true, "reports": true, "api": true}')
    ON CONFLICT DO NOTHING;
  `);

  console.log('Migration 002: Multi-tenant schema created');
}

module.exports = { up };
