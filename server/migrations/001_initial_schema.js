const { pool } = require('../db');

async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'cashier' CHECK(role IN ('admin','cashier')),
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS halls (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS tables (
      id SERIAL PRIMARY KEY,
      hall_id INTEGER NOT NULL REFERENCES halls(id),
      number INTEGER NOT NULL,
      x NUMERIC(10,2) NOT NULL DEFAULT 10,
      y NUMERIC(10,2) NOT NULL DEFAULT 10,
      seats INTEGER NOT NULL DEFAULT 4,
      shape VARCHAR(20) NOT NULL DEFAULT 'square' CHECK(shape IN ('square','rectangle','round','corner')),
      width NUMERIC(10,2) NOT NULL DEFAULT 72,
      height NUMERIC(10,2) NOT NULL DEFAULT 72,
      active BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      name VARCHAR(255) NOT NULL,
      price NUMERIC(12,2) NOT NULL DEFAULT 0,
      cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      unit VARCHAR(10) NOT NULL DEFAULT 'шт' CHECK(unit IN ('шт','г','мл','порц')),
      track_inventory BOOLEAN NOT NULL DEFAULT true,
      is_composite BOOLEAN NOT NULL DEFAULT false,
      output_amount NUMERIC(12,3) NOT NULL DEFAULT 1,
      recipe_description TEXT NOT NULL DEFAULT '',
      min_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS product_ingredients (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      ingredient_id INTEGER NOT NULL REFERENCES products(id),
      amount NUMERIC(12,3) NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS supplies (
      id SERIAL PRIMARY KEY,
      supplier VARCHAR(255),
      note TEXT,
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS supply_items (
      id SERIAL PRIMARY KEY,
      supply_id INTEGER NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity NUMERIC(12,3) NOT NULL,
      unit_cost NUMERIC(12,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS register_days (
      id SERIAL PRIMARY KEY,
      opened_at TIMESTAMP DEFAULT NOW(),
      closed_at TIMESTAMP,
      opened_by INTEGER REFERENCES users(id),
      closed_by INTEGER,
      opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
      expected_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
      actual_cash NUMERIC(12,2),
      total_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_card NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      table_id INTEGER REFERENCES tables(id),
      register_day_id INTEGER REFERENCES register_days(id),
      user_id INTEGER REFERENCES users(id),
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','cancelled')),
      payment_method VARCHAR(20) CHECK(payment_method IN ('cash','card')),
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      closed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name VARCHAR(255) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price NUMERIC(12,2) NOT NULL,
      cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventories (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMP DEFAULT NOW(),
      closed_at TIMESTAMP,
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
      user_id INTEGER REFERENCES users(id),
      note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id SERIAL PRIMARY KEY,
      inventory_id INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name VARCHAR(255) NOT NULL,
      unit VARCHAR(10) NOT NULL DEFAULT 'шт',
      system_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      actual_quantity NUMERIC(12,3)
    );
  `);

  console.log('Migration 001: Initial schema created');
}

module.exports = { up };
