const { run, all } = require('../db');

async function up() {
  // Добавить pin_hash для PIN-авторизации сотрудников
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255)`);

  // Очистить существующие slug'и — убрать timestamp-суффикс
  // moya-kalyannaya-1706000000000 → moya-kalyannaya
  const tenants = await all('SELECT id, slug FROM tenants');
  for (const t of tenants) {
    // Убираем суффикс вида -NNNNNNNNNNNN (10+ цифр в конце — это timestamp)
    const cleaned = t.slug.replace(/-\d{10,}$/, '');
    if (cleaned !== t.slug && cleaned.length > 0) {
      // Проверяем что очищенный slug не занят другим тенантом
      const existing = await run(
        'SELECT id FROM tenants WHERE slug = $1 AND id != $2',
        [cleaned, t.id]
      );
      if (existing.rowCount === 0) {
        await run('UPDATE tenants SET slug = $1 WHERE id = $2', [cleaned, t.id]);
      }
    }
  }

  console.log('Migration 011_subdomain_pin_auth complete');
}

module.exports = { up };
