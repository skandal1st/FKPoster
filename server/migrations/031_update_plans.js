const { run, get } = require('../db');

exports.up = async () => {
  // 1. Add new columns to plans table
  await run(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS yearly_price NUMERIC(10,2)`);
  await run(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_integrations INTEGER`);
  await run(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS code VARCHAR(50)`);

  // 2. Update plans in order that avoids UNIQUE(name) conflicts
  // Step A: "Бизнес" → "Сети" (code=chains)
  const chainsPlan = await get(
    `SELECT id FROM plans WHERE name IN ('Бизнес', 'business') AND active = true ORDER BY id DESC LIMIT 1`
  );
  if (chainsPlan) {
    await run(`UPDATE plans SET
      name = 'Сети', code = 'chains', price = 5990, yearly_price = 57500,
      max_users = NULL, max_halls = NULL, max_products = NULL, max_orders_monthly = NULL,
      max_integrations = NULL,
      features = '{"basic":true,"reports":true,"inventory":true,"cost_price":true,"finance":true,"api":true,"kkt":true,"edo":true,"chain_management":true}'::jsonb
    WHERE id = $1`, [chainsPlan.id]);
  }

  // Step B: "pro" / "Pro" → "Бизнес" (code=business)
  const businessPlan = await get(
    `SELECT id FROM plans WHERE name IN ('pro', 'Pro', 'Про') AND active = true ORDER BY id DESC LIMIT 1`
  );
  if (businessPlan) {
    await run(`UPDATE plans SET
      name = 'Бизнес', code = 'business', price = 3990, yearly_price = 38000,
      max_users = NULL, max_halls = NULL, max_products = NULL, max_orders_monthly = NULL,
      max_integrations = NULL,
      features = '{"basic":true,"reports":true,"inventory":true,"cost_price":true,"finance":true,"api":true,"kkt":true,"edo":true}'::jsonb
    WHERE id = $1`, [businessPlan.id]);
  }

  // Step C: "basic" / "Basic" / "Старт" / "start" → "Старт" (code=start)
  const startPlan = await get(
    `SELECT id FROM plans WHERE name IN ('basic', 'Basic', 'Старт', 'start') AND active = true ORDER BY id DESC LIMIT 1`
  );
  if (startPlan) {
    await run(`UPDATE plans SET
      name = 'Старт', code = 'start', price = 1990, yearly_price = 21400,
      max_users = NULL, max_halls = 2, max_products = NULL, max_orders_monthly = NULL,
      max_integrations = 2,
      features = '{"basic":true,"reports":true,"inventory":true}'::jsonb
    WHERE id = $1`, [startPlan.id]);
  }

  // Step D: "free" / "Free" / "Бесплатный" → "Бесплатный" (code=free)
  const freePlan = await get(
    `SELECT id FROM plans WHERE name IN ('free', 'Free', 'Бесплатный') AND active = true ORDER BY id DESC LIMIT 1`
  );
  if (freePlan) {
    await run(`UPDATE plans SET
      name = 'Бесплатный', code = 'free', price = 0, yearly_price = NULL,
      max_users = 2, max_halls = 1, max_products = 50, max_orders_monthly = 150,
      max_integrations = 0,
      features = '{"basic":true}'::jsonb
    WHERE id = $1`, [freePlan.id]);
  }

  // 3. Add unique index on code (only for non-null values)
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS plans_code_unique ON plans (code) WHERE code IS NOT NULL`);

  console.log('  031_update_plans done');
};
