const { run } = require('../db');

exports.up = async () => {
  // Добавить режим таймера на тенанте
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS table_timer_mode VARCHAR(10) DEFAULT 'auto'`);

  // Мигрировать данные: show_table_timer = false → 'off', остальное → 'auto'
  await run(`UPDATE tenants SET table_timer_mode = 'off' WHERE show_table_timer = false`);
  await run(`UPDATE tenants SET table_timer_mode = 'auto' WHERE show_table_timer = true OR show_table_timer IS NULL`);

  // Добавить timer_started_at в orders (для ручного режима)
  await run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ`);
};
