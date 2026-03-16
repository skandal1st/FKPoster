const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, all, run, transaction } = require('../db');
const config = require('../config');

const router = express.Router();

// Алфавит без I, O, 0, 1 для читаемых кодов
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateReferralCode() {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

async function generateUniqueCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateReferralCode();
    const existing = await get('SELECT id FROM partners WHERE referral_code = $1', [code]);
    if (!existing) return code;
  }
  throw new Error('Не удалось сгенерировать уникальный реферальный код');
}

// Middleware: авторизация партнёра
async function partnerAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), config.JWT_SECRET);
    if (!decoded.partner_id) {
      return res.status(401).json({ error: 'Недействительный токен' });
    }
    const partner = await get('SELECT * FROM partners WHERE id = $1 AND active = true', [decoded.partner_id]);
    if (!partner) {
      return res.status(401).json({ error: 'Партнёр не найден' });
    }
    req.partner = partner;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

// POST /partner/register — регистрация партнёра
router.post('/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Заполните имя, email и пароль' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
  }

  const existing = await get('SELECT id FROM partners WHERE email = $1', [email]);
  if (existing) {
    return res.status(400).json({ error: 'Партнёр с таким email уже зарегистрирован' });
  }

  const referralCode = await generateUniqueCode();
  const hash = await bcrypt.hash(password, 10);

  // Проверяем, есть ли owner с таким email
  const ownerUser = await get("SELECT id FROM users WHERE email = $1 AND role = 'owner' AND active = true", [email]);

  const result = await run(
    'INSERT INTO partners (name, email, phone, password_hash, referral_code, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [name, email, phone || null, hash, referralCode, ownerUser?.id || null]
  );

  const token = jwt.sign({ partner_id: result.id }, config.JWT_SECRET, { expiresIn: '30d' });

  res.json({
    token,
    partner: { id: result.id, name, email, phone: phone || null, referral_code: referralCode },
  });
});

// POST /partner/login — вход партнёра
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Введите email и пароль' });
  }

  const partner = await get('SELECT * FROM partners WHERE email = $1 AND active = true', [email]);
  if (!partner) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const valid = await bcrypt.compare(password, partner.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const token = jwt.sign({ partner_id: partner.id }, config.JWT_SECRET, { expiresIn: '30d' });

  res.json({
    token,
    partner: {
      id: partner.id, name: partner.name, email: partner.email,
      phone: partner.phone, referral_code: partner.referral_code,
    },
  });
});

// GET /partner/me — профиль партнёра
router.get('/me', partnerAuth, async (req, res) => {
  const p = req.partner;
  res.json({
    id: p.id, name: p.name, email: p.email, phone: p.phone,
    referral_code: p.referral_code,
    balance: parseFloat(p.balance),
    total_earned: parseFloat(p.total_earned),
    total_withdrawn: parseFloat(p.total_withdrawn),
  });
});

// GET /partner/dashboard — статистика
router.get('/dashboard', partnerAuth, async (req, res) => {
  const partnerId = req.partner.id;

  const totalReferrals = await get(
    'SELECT COUNT(*)::int AS count FROM referrals WHERE partner_id = $1',
    [partnerId]
  );

  const activeReferrals = await get(
    `SELECT COUNT(*)::int AS count FROM referrals r
     JOIN subscriptions s ON s.tenant_id = r.tenant_id AND s.status IN ('active','trialing')
     WHERE r.partner_id = $1`,
    [partnerId]
  );

  const recentCommissions = await all(
    `SELECT pc.plan_name, pc.plan_price, pc.commission_amount, pc.period_start, pc.created_at,
            t.name AS tenant_name
     FROM partner_commissions pc
     JOIN tenants t ON t.id = pc.tenant_id
     WHERE pc.partner_id = $1
     ORDER BY pc.created_at DESC LIMIT 10`,
    [partnerId]
  );

  res.json({
    total_referrals: totalReferrals.count,
    active_referrals: activeReferrals.count,
    balance: parseFloat(req.partner.balance),
    total_earned: parseFloat(req.partner.total_earned),
    referral_code: req.partner.referral_code,
    recent_commissions: recentCommissions.map((c) => ({
      ...c,
      plan_price: parseFloat(c.plan_price),
      commission_amount: parseFloat(c.commission_amount),
    })),
  });
});

// GET /partner/referrals — список привлечённых
router.get('/referrals', partnerAuth, async (req, res) => {
  const referrals = await all(
    `SELECT r.id, r.created_at, r.promo_applied,
            t.name AS tenant_name, t.slug,
            p.name AS plan_name, s.status AS subscription_status,
            COALESCE(SUM(pc.commission_amount), 0) AS total_commission
     FROM referrals r
     JOIN tenants t ON t.id = r.tenant_id
     LEFT JOIN LATERAL (
       SELECT plan_id, status FROM subscriptions
       WHERE tenant_id = r.tenant_id AND status IN ('active','trialing')
       ORDER BY id DESC LIMIT 1
     ) s ON true
     LEFT JOIN plans p ON p.id = s.plan_id
     LEFT JOIN partner_commissions pc ON pc.referral_id = r.id
     WHERE r.partner_id = $1
     GROUP BY r.id, r.created_at, r.promo_applied, t.name, t.slug, p.name, s.status
     ORDER BY r.created_at DESC`,
    [req.partner.id]
  );

  res.json(referrals.map((r) => ({
    ...r,
    total_commission: parseFloat(r.total_commission),
  })));
});

// GET /partner/commissions — история начислений
router.get('/commissions', partnerAuth, async (req, res) => {
  const commissions = await all(
    `SELECT pc.id, pc.plan_name, pc.plan_price, pc.commission_rate, pc.commission_amount,
            pc.period_start, pc.created_at, t.name AS tenant_name
     FROM partner_commissions pc
     JOIN tenants t ON t.id = pc.tenant_id
     WHERE pc.partner_id = $1
     ORDER BY pc.created_at DESC`,
    [req.partner.id]
  );

  res.json(commissions.map((c) => ({
    ...c,
    plan_price: parseFloat(c.plan_price),
    commission_rate: parseFloat(c.commission_rate),
    commission_amount: parseFloat(c.commission_amount),
  })));
});

// POST /partner/payouts — заявка на вывод
router.post('/payouts', partnerAuth, async (req, res) => {
  const { amount, payment_details } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Укажите сумму' });
  }
  if (!payment_details) {
    return res.status(400).json({ error: 'Укажите реквизиты для выплаты' });
  }

  const balance = parseFloat(req.partner.balance);
  if (amount > balance) {
    return res.status(400).json({ error: 'Недостаточно средств на балансе' });
  }

  const result = await transaction(async (tx) => {
    const payout = await tx.run(
      'INSERT INTO partner_payouts (partner_id, amount, payment_details) VALUES ($1, $2, $3) RETURNING id',
      [req.partner.id, amount, payment_details]
    );
    await tx.run(
      'UPDATE partners SET balance = balance - $1, total_withdrawn = total_withdrawn + $1 WHERE id = $2',
      [amount, req.partner.id]
    );
    return payout;
  });

  res.json({ id: result.id, amount, status: 'pending' });
});

// GET /partner/payouts — список заявок
router.get('/payouts', partnerAuth, async (req, res) => {
  const payouts = await all(
    'SELECT * FROM partner_payouts WHERE partner_id = $1 ORDER BY created_at DESC',
    [req.partner.id]
  );

  res.json(payouts.map((p) => ({ ...p, amount: parseFloat(p.amount) })));
});

module.exports = router;
