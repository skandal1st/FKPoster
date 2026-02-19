const { getDb } = require('../db');

async function runMigrations() {
  await getDb();

  const migrations = [
    require('./001_initial_schema'),
    require('./002_multi_tenant'),
    require('./003_add_ingredients'),
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
