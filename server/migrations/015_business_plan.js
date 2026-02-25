const { run, get } = require('../db');

exports.up = async () => {
  // Проверяем оба варианта названия
  let existing = await get("SELECT id FROM plans WHERE name IN ('business', 'Бизнес') AND active = true");
  if (!existing) {
    await run(`
      INSERT INTO plans (name, price, max_users, max_halls, max_products, features)
      VALUES ('Бизнес', 4990, 50, 20, 5000, '{"basic": true, "reports": true, "api": true, "chain_management": true}')
    `);
  } else {
    await run(`
      UPDATE plans SET features = features || '{"chain_management": true}'::jsonb
      WHERE id = $1
    `, [existing.id]);
  }

  console.log('Migration 015: business plan with chain_management — done');
};
