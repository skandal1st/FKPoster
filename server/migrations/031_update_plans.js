const { run, get, all } = require('../db');

exports.up = async () => {
  // 1. Add new columns to plans table
  await run(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS yearly_price NUMERIC(10,2)`);
  await run(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_integrations INTEGER`);
  await run(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS code VARCHAR(50)`);

  // 2. Use code-based idempotency: skip each step if target code already set

  // Step A: rename the high-tier "Бизнес" plan → "Сети" (code=chains)
  // Find the plan that SHOULD become "Сети": it's the one with chain_management feature
  // Could currently be named 'Бизнес', 'business', or already 'Сети'
  const existingChains = await get(
    `SELECT id FROM plans WHERE code = 'chains' LIMIT 1`
  );
  if (!existingChains) {
    // Try to find by feature flag (most reliable), then by name
    let chainsPlan = await get(
      `SELECT id FROM plans WHERE features->>'chain_management' = 'true' AND active = true ORDER BY id DESC LIMIT 1`
    );
    if (!chainsPlan) {
      chainsPlan = await get(
        `SELECT id FROM plans WHERE name IN ('Бизнес', 'Сети', 'business') AND active = true ORDER BY id DESC LIMIT 1`
      );
    }
    if (chainsPlan) {
      // If another row already has name='Сети' but wrong id, temporarily rename it
      const conflictRow = await get(
        `SELECT id FROM plans WHERE name = 'Сети' AND id != $1`, [chainsPlan.id]
      );
      if (conflictRow) {
        await run(`UPDATE plans SET name = '__seti_tmp__' WHERE id = $1`, [conflictRow.id]);
      }
      await run(`UPDATE plans SET
        name = 'Сети', code = 'chains', price = 5990, yearly_price = 57500,
        max_users = NULL, max_halls = NULL, max_products = NULL, max_orders_monthly = NULL,
        max_integrations = NULL,
        features = '{"basic":true,"reports":true,"inventory":true,"cost_price":true,"finance":true,"api":true,"kkt":true,"edo":true,"chain_management":true}'::jsonb
      WHERE id = $1`, [chainsPlan.id]);
      // Clean up temp-renamed duplicate if it exists
      if (conflictRow) {
        await run(`DELETE FROM plans WHERE name = '__seti_tmp__'`);
      }
    }
  }

  // Step B: "pro" / "Pro" → "Бизнес" (code=business)
  const existingBusiness = await get(
    `SELECT id FROM plans WHERE code = 'business' LIMIT 1`
  );
  if (!existingBusiness) {
    const businessPlan = await get(
      `SELECT id FROM plans WHERE name IN ('pro', 'Pro', 'Про', 'Бизнес') AND code IS DISTINCT FROM 'chains' AND active = true ORDER BY id DESC LIMIT 1`
    );
    if (businessPlan) {
      const conflictRow = await get(
        `SELECT id FROM plans WHERE name = 'Бизнес' AND id != $1`, [businessPlan.id]
      );
      if (conflictRow) {
        await run(`UPDATE plans SET name = '__biznes_tmp__' WHERE id = $1`, [conflictRow.id]);
      }
      await run(`UPDATE plans SET
        name = 'Бизнес', code = 'business', price = 3990, yearly_price = 38000,
        max_users = NULL, max_halls = NULL, max_products = NULL, max_orders_monthly = NULL,
        max_integrations = NULL,
        features = '{"basic":true,"reports":true,"inventory":true,"cost_price":true,"finance":true,"api":true,"kkt":true,"edo":true}'::jsonb
      WHERE id = $1`, [businessPlan.id]);
      if (conflictRow) {
        await run(`DELETE FROM plans WHERE name = '__biznes_tmp__'`);
      }
    }
  }

  // Step C: → "Старт" (code=start)
  const existingStart = await get(
    `SELECT id FROM plans WHERE code = 'start' LIMIT 1`
  );
  if (!existingStart) {
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
  }

  // Step D: → "Бесплатный" (code=free)
  const existingFree = await get(
    `SELECT id FROM plans WHERE code = 'free' LIMIT 1`
  );
  if (!existingFree) {
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
  }

  // 3. Add unique index on code (only for non-null values)
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS plans_code_unique ON plans (code) WHERE code IS NOT NULL`);

  console.log('  031_update_plans done');
};
