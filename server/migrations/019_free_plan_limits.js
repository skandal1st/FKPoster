const { run, get } = require('../db');

exports.up = async function () {
  // Add max_orders_monthly column to plans
  await run(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_orders_monthly INTEGER DEFAULT NULL`);

  // Update free plan: set order limit and restrict features to basic only
  const freePlan = await get(`SELECT id FROM plans WHERE name = 'free' LIMIT 1`);
  if (freePlan) {
    await run(
      `UPDATE plans SET max_orders_monthly = 150, features = $1 WHERE id = $2`,
      [JSON.stringify({ basic: true }), freePlan.id]
    );
  }

  // Update paid plans: add reports, inventory, cost_price features
  // "start" plan
  const startPlan = await get(`SELECT id, features FROM plans WHERE name = 'start' LIMIT 1`);
  if (startPlan) {
    const features = typeof startPlan.features === 'object' && startPlan.features ? startPlan.features : {};
    features.basic = true;
    features.reports = true;
    features.inventory = true;
    features.cost_price = true;
    await run(`UPDATE plans SET features = $1, max_orders_monthly = NULL WHERE id = $2`, [JSON.stringify(features), startPlan.id]);
  }

  // "business" plan
  const businessPlan = await get(`SELECT id, features FROM plans WHERE name = 'business' LIMIT 1`);
  if (businessPlan) {
    const features = typeof businessPlan.features === 'object' && businessPlan.features ? businessPlan.features : {};
    features.basic = true;
    features.reports = true;
    features.inventory = true;
    features.cost_price = true;
    features.api = true;
    await run(`UPDATE plans SET features = $1, max_orders_monthly = NULL WHERE id = $2`, [JSON.stringify(features), businessPlan.id]);
  }

  // "pro" plan
  const proPlan = await get(`SELECT id, features FROM plans WHERE name = 'pro' LIMIT 1`);
  if (proPlan) {
    const features = typeof proPlan.features === 'object' && proPlan.features ? proPlan.features : {};
    features.basic = true;
    features.reports = true;
    features.inventory = true;
    features.cost_price = true;
    features.api = true;
    features.chain_management = true;
    await run(`UPDATE plans SET features = $1, max_orders_monthly = NULL WHERE id = $2`, [JSON.stringify(features), proPlan.id]);
  }
};
