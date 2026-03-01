const { pool } = require('../db');

async function up() {
  await pool.query(`
    -- Заказы: фильтрация по статусу и дате
    CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_closed_at ON orders(tenant_id, closed_at) WHERE status = 'paid';
    CREATE INDEX IF NOT EXISTS idx_orders_register_day ON orders(register_day_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_table_open ON orders(table_id, status) WHERE status = 'open';

    -- Позиции заказов (JOIN при каждом получении заказа)
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

    -- Ингредиенты (composite product lookup при закрытии заказа)
    CREATE INDEX IF NOT EXISTS idx_product_ingredients_product ON product_ingredients(product_id);

    -- Подписки (checkSubscription middleware на каждом запросе)
    CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_status ON subscriptions(tenant_id, status);

    -- Интеграции (loadIntegrations middleware)
    CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant ON tenant_integrations(tenant_id);

    -- Кассовые дни
    CREATE INDEX IF NOT EXISTS idx_register_days_tenant_status ON register_days(tenant_id, status);

    -- Пользователи по tenant (auth middleware, employee list)
    CREATE INDEX IF NOT EXISTS idx_users_tenant_active ON users(tenant_id, active);

    -- Столики по залу
    CREATE INDEX IF NOT EXISTS idx_tables_hall_active ON tables(hall_id, active);

    -- Продукты по tenant и категории
    CREATE INDEX IF NOT EXISTS idx_products_tenant_active ON products(tenant_id, active);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, active);

    -- Tenants по slug (subdomain middleware)
    CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
  `);
}

module.exports = { up };
