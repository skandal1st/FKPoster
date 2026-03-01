const { pool } = require('../db');

async function up() {
  await pool.query(`
    -- Настройки зарплаты сотрудника
    CREATE TABLE IF NOT EXISTS salary_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      daily_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, tenant_id)
    );

    -- Процент от продаж по цехам (для каждого сотрудника свой набор)
    CREATE TABLE IF NOT EXISTS salary_workshop_rates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      workshop_id INTEGER NOT NULL REFERENCES workshops(id),
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
      UNIQUE(user_id, workshop_id)
    );

    -- График работы (один выход в день)
    CREATE TABLE IF NOT EXISTS work_schedule (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, date, tenant_id)
    );

    -- Выплаты зарплаты
    CREATE TABLE IF NOT EXISTS salary_payouts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      amount NUMERIC(12,2) NOT NULL,
      period_from DATE NOT NULL,
      period_to DATE NOT NULL,
      note TEXT,
      paid_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Конец рабочего дня (0 = полночь, 2 = 02:00 — заказы до этого часа считаются за предыдущий день)
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS day_end_hour INTEGER NOT NULL DEFAULT 0;

    -- Индексы
    CREATE INDEX IF NOT EXISTS idx_salary_settings_tenant ON salary_settings(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_salary_workshop_rates_user ON salary_workshop_rates(user_id);
    CREATE INDEX IF NOT EXISTS idx_work_schedule_tenant_date ON work_schedule(tenant_id, date);
    CREATE INDEX IF NOT EXISTS idx_work_schedule_user_date ON work_schedule(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_salary_payouts_tenant ON salary_payouts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_salary_payouts_user ON salary_payouts(user_id);
  `);
}

module.exports = { up };
