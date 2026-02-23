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
