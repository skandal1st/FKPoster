const { pool } = require('../db');

async function up() {
  await pool.query(`
    -- Таблица групп ингредиентов (например "Табак" — объединяет все вкусы)
    CREATE TABLE IF NOT EXISTS ingredient_groups (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      name VARCHAR(255) NOT NULL,
      unit VARCHAR(10) NOT NULL DEFAULT 'г',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Ингредиент может принадлежать группе
    ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredient_group_id INTEGER REFERENCES ingredient_groups(id);

    -- Рецепт может ссылаться на группу вместо конкретного ингредиента
    ALTER TABLE product_ingredients ADD COLUMN IF NOT EXISTS ingredient_group_id INTEGER REFERENCES ingredient_groups(id);

    -- ingredient_id теперь nullable (если используется группа)
    ALTER TABLE product_ingredients ALTER COLUMN ingredient_id DROP NOT NULL;
  `);

  console.log('Migration 007: Added ingredient_groups table and group references');
}

module.exports = { up };
