const { run } = require('../db');

exports.up = async () => {
  // Таблица партнёров
  await run(`
    CREATE TABLE IF NOT EXISTS partners (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(50),
      password_hash VARCHAR(255) NOT NULL,
      referral_code VARCHAR(20) NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id),
      balance NUMERIC(12,2) DEFAULT 0,
      total_earned NUMERIC(12,2) DEFAULT 0,
      total_withdrawn NUMERIC(12,2) DEFAULT 0,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Связь партнёр → привлечённый тенант
  await run(`
    CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      partner_id INTEGER NOT NULL REFERENCES partners(id),
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      promo_applied BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id)
    )
  `);

  // Начисления комиссий
  await run(`
    CREATE TABLE IF NOT EXISTS partner_commissions (
      id SERIAL PRIMARY KEY,
      partner_id INTEGER NOT NULL REFERENCES partners(id),
      referral_id INTEGER NOT NULL REFERENCES referrals(id),
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      plan_name VARCHAR(100) NOT NULL,
      plan_price NUMERIC(12,2) NOT NULL,
      commission_rate NUMERIC(5,4) DEFAULT 0.30,
      commission_amount NUMERIC(12,2) NOT NULL,
      period_start DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(referral_id, period_start)
    )
  `);

  // Заявки на вывод
  await run(`
    CREATE TABLE IF NOT EXISTS partner_payouts (
      id SERIAL PRIMARY KEY,
      partner_id INTEGER NOT NULL REFERENCES partners(id),
      amount NUMERIC(12,2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      payment_details TEXT,
      admin_comment TEXT,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Колонка referred_by_code в tenants
  await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS referred_by_code VARCHAR(20)`);

  // Индексы
  await run(`CREATE INDEX IF NOT EXISTS idx_referrals_partner_id ON referrals(partner_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner_id ON partner_commissions(partner_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_id ON partner_commissions(tenant_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner_id ON partner_payouts(partner_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_partner_payouts_status ON partner_payouts(status)`);

  console.log('Migration 030: referral program — done');
};
