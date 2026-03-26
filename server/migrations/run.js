const { getDb } = require('../db');

async function runMigrations() {
  await getDb();

  const migrations = [
    require('./001_initial_schema'),
    require('./002_multi_tenant'),
    require('./003_add_ingredients'),
    require('./004_superadmin'),
    require('./005_marking_egais'),
    require('./006_guests_loyalty'),
    require('./007_ingredient_groups'),
    require('./008_workshops'),
    require('./009_hall_grid'),
    require('./010_plans_dedupe'),
    require('./011_subdomain_pin_auth'),
    require('./012_print_settings'),
    require('./013_table_labels'),
    require('./014_chains'),
    require('./015_business_plan'),
    require('./016_mixed_payment'),
    require('./017_performance_indexes'),
    require('./018_salary_module'),
    require('./019_free_plan_limits'),
    require('./020_phone_city'),
    require('./021_edo_integration'),
    require('./022_kkt_integration'),
    require('./023_table_timer_setting'),
    require('./024_order_idempotency'),
    require('./025_product_modifiers'),
    require('./026_business_types_and_variants'),
    require('./027_physical_kkt_devices'),
    require('./028_orders_fiscal_fields'),
    require('./029_timer_modes'),
    require('./030_referral_program'),
    require('./031_update_plans'),
    require('./032_bonus_tiers'),
    require('./033_cash_operations'),
  ];

  for (const migration of migrations) {
    await migration.up();
  }

  console.log('All migrations complete');
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
