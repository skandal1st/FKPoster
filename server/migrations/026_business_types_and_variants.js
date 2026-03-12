const { run } = require('../db');

exports.up = async function () {
  // 1. Расширение таблицы settings / tenants для хранения типа бизнеса и темы
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) DEFAULT 'hookah'`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pos_mode VARCHAR(50) DEFAULT 'table_service'`);
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'dark'`);

  // 2. Расширение таблицы товаров для изображений
  await run(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS image_url VARCHAR(255) DEFAULT null;
  `);

  // 3. Таблица вариаций товаров (например, Размеры: 0.2л, 0.4л)
  await run(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      price NUMERIC(12, 2) NOT NULL,
      cost_price NUMERIC(12, 2) DEFAULT 0,
      barcode VARCHAR(255),
      is_active BOOLEAN DEFAULT true
    )
  `);
  
  await run('CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id)');

  // 4. Модификация order_items для хранения выбранной вариации
  await run(`
    ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id);
  `);

  // 5. Типы заказа для FastPOS (Dine In / Take Away / Delivery)
  await run(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS order_type VARCHAR(50) DEFAULT 'dine_in';
  `);
  // 6. Обновить CHECK constraint для payment_method — добавить 'delivery'
  await run(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check`);
  await run(`ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cash', 'card', 'mixed', 'delivery'))`);

  console.log('Migration 026_business_types_and_variants complete');
};
