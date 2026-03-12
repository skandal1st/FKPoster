const { run } = require('../db');

exports.up = async function () {
  // Каталог модификаторов (tenant-level, переиспользуемые между товарами)
  await run(`
    CREATE TABLE IF NOT EXISTS modifiers (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      name VARCHAR(255) NOT NULL,
      price NUMERIC(12,2) NOT NULL DEFAULT 0,
      cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      ingredient_id INTEGER REFERENCES products(id),
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_modifiers_tenant ON modifiers(tenant_id)');

  // Какие модификаторы доступны для какого товара (M:N)
  await run(`
    CREATE TABLE IF NOT EXISTS product_modifiers (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      modifier_id INTEGER NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
      UNIQUE(product_id, modifier_id)
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_product_modifiers_product ON product_modifiers(product_id)');

  // Выбранные модификаторы в позициях заказа (денормализация цены/имени)
  await run(`
    CREATE TABLE IF NOT EXISTS order_item_modifiers (
      id SERIAL PRIMARY KEY,
      order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      modifier_id INTEGER REFERENCES modifiers(id),
      modifier_name VARCHAR(255) NOT NULL,
      price NUMERIC(12,2) NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_item ON order_item_modifiers(order_item_id)');
  console.log('Migration 025_product_modifiers complete');
};
