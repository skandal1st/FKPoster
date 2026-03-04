const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, all } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const config = require('../config');
const { generateUniqueSlug, validateSlug } = require('../utils/slugify');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Введите email и пароль' });
  }

  const user = await get('SELECT * FROM users WHERE email = $1 AND active = true', [email]);
  if (!user) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  // Если запрос с сабдомена — проверяем что user принадлежит этому tenant'у
  if (req.subdomainTenant && user.tenant_id !== req.subdomainTenant.id && user.role !== 'superadmin') {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, tenant_id: user.tenant_id, chain_id: user.chain_id || null },
    config.JWT_SECRET,
    { expiresIn: '24h' }
  );

  let tenant = null;
  if (user.tenant_id) {
    tenant = await get(
      'SELECT id, name, slug, logo_url, accent_color FROM tenants WHERE id = $1',
      [user.tenant_id]
    );
  }

  let chain = null;
  if (user.chain_id) {
    chain = await get('SELECT id, name FROM chains WHERE id = $1', [user.chain_id]);
  }

  let plan = null;
  if (user.tenant_id) {
    const sub = await get(
      `SELECT p.features, p.max_orders_monthly, p.name as plan_name
       FROM subscriptions s JOIN plans p ON s.plan_id = p.id
       WHERE s.tenant_id = $1 AND s.status IN ('active','trialing')
       ORDER BY s.id DESC LIMIT 1`,
      [user.tenant_id]
    );
    if (sub) {
      plan = { features: sub.features || {}, limits: { max_orders_monthly: sub.max_orders_monthly }, plan_name: sub.plan_name };
    }
  }

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, tenant_id: user.tenant_id, chain_id: user.chain_id || null },
    tenant,
    chain,
    plan,
  });
});

router.post('/register', async (req, res) => {
  const { company_name, name, email, password, slug: requestedSlug, phone, city } = req.body;
  if (!company_name || !name || !email || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
  }

  const existingUser = await get('SELECT id FROM users WHERE email = $1', [email]);
  if (existingUser) {
    return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
  }

  const { transaction } = require('../db');

  let slug;
  if (requestedSlug) {
    const slugError = validateSlug(requestedSlug);
    if (slugError) {
      return res.status(400).json({ error: slugError });
    }
    const existingTenant = await get('SELECT id FROM tenants WHERE slug = $1', [requestedSlug]);
    if (existingTenant) {
      return res.status(400).json({ error: 'Этот адрес уже занят' });
    }
    slug = requestedSlug;
  } else {
    slug = await generateUniqueSlug(company_name);
  }

  const result = await transaction(async (tx) => {
    const tenantRes = await tx.run(
      'INSERT INTO tenants (name, slug, city) VALUES ($1, $2, $3) RETURNING id',
      [company_name, slug, city || null]
    );
    const tenantId = tenantRes.id;

    const hash = await bcrypt.hash(password, 10);
    const userRes = await tx.run(
      'INSERT INTO users (email, username, password, name, role, tenant_id, phone) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [email, email, hash, name, 'owner', tenantId, phone || null]
    );
    const userId = userRes.id;

    const freePlan = await tx.get('SELECT id FROM plans WHERE name = $1 AND active = true', ['free']);
    if (freePlan) {
      await tx.run(
        "INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end) VALUES ($1, $2, 'trialing', NOW() + INTERVAL '14 days')",
        [tenantId, freePlan.id]
      );
    }

    const defaultCategories = [
      { name: 'Кальяны', color: '#6366f1', sort_order: 0 },
      { name: 'Напитки', color: '#22c55e', sort_order: 1 },
      { name: 'Еда', color: '#f59e0b', sort_order: 2 },
    ];
    for (const cat of defaultCategories) {
      await tx.run(
        'INSERT INTO categories (name, color, sort_order, tenant_id) VALUES ($1, $2, $3, $4)',
        [cat.name, cat.color, cat.sort_order, tenantId]
      );
    }

    return { userId, tenantId };
  });

  const user = await get('SELECT id, email, name, role, tenant_id FROM users WHERE id = $1', [result.userId]);
  const tenant = await get('SELECT id, name, slug, logo_url, accent_color FROM tenants WHERE id = $1', [result.tenantId]);

  const token = jwt.sign(
    { id: user.id, role: user.role, tenant_id: user.tenant_id },
    config.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, user, tenant });
});

router.post('/accept-invite', async (req, res) => {
  const { token: inviteToken, name, password } = req.body;
  if (!inviteToken || !name || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }

  const invitation = await get(
    'SELECT * FROM invitations WHERE token = $1 AND accepted = false AND expires_at > NOW()',
    [inviteToken]
  );
  if (!invitation) {
    return res.status(400).json({ error: 'Приглашение недействительно или истекло' });
  }

  const existingUser = await get('SELECT id FROM users WHERE email = $1', [invitation.email]);
  if (existingUser) {
    return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
  }

  const { transaction } = require('../db');
  const userId = await transaction(async (tx) => {
    const hash = await bcrypt.hash(password, 10);
    const userRes = await tx.run(
      'INSERT INTO users (email, username, password, name, role, tenant_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [invitation.email, invitation.email, hash, name, invitation.role, invitation.tenant_id]
    );
    await tx.run('UPDATE invitations SET accepted = true WHERE id = $1', [invitation.id]);
    return userRes.id;
  });

  const user = await get('SELECT id, email, name, role, tenant_id FROM users WHERE id = $1', [userId]);
  const tenant = await get('SELECT id, name, slug, logo_url, accent_color FROM tenants WHERE id = $1', [user.tenant_id]);

  const jwtToken = jwt.sign(
    { id: user.id, role: user.role, tenant_id: user.tenant_id },
    config.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token: jwtToken, user, tenant });
});

// GET /auth/employees — список сотрудников для PIN-входа на сабдомене (публичный)
router.get('/employees', async (req, res) => {
  if (!req.subdomainTenant) {
    return res.status(400).json({ error: 'Доступно только на сабдомене заведения' });
  }

  const employees = await all(
    'SELECT id, name, role FROM users WHERE tenant_id = $1 AND active = true AND pin_hash IS NOT NULL ORDER BY name',
    [req.subdomainTenant.id]
  );

  res.json({
    employees,
    tenant: {
      name: req.subdomainTenant.name,
      logo_url: req.subdomainTenant.logo_url,
      accent_color: req.subdomainTenant.accent_color,
    },
  });
});

// POST /auth/pin-login — вход по PIN-коду (публичный)
router.post('/pin-login', async (req, res) => {
  const { user_id, pin } = req.body;
  if (!user_id || !pin) {
    return res.status(400).json({ error: 'Укажите пользователя и PIN-код' });
  }
  if (!req.subdomainTenant) {
    return res.status(400).json({ error: 'Доступно только на сабдомене заведения' });
  }

  const user = await get(
    'SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND active = true',
    [user_id, req.subdomainTenant.id]
  );
  if (!user || !user.pin_hash) {
    return res.status(401).json({ error: 'Неверный PIN-код' });
  }

  const valid = await bcrypt.compare(pin, user.pin_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Неверный PIN-код' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, tenant_id: user.tenant_id },
    config.JWT_SECRET,
    { expiresIn: '24h' }
  );

  const tenant = await get(
    'SELECT id, name, slug, logo_url, accent_color FROM tenants WHERE id = $1',
    [user.tenant_id]
  );

  let plan = null;
  if (user.tenant_id) {
    const sub = await get(
      `SELECT p.features, p.max_orders_monthly, p.name as plan_name
       FROM subscriptions s JOIN plans p ON s.plan_id = p.id
       WHERE s.tenant_id = $1 AND s.status IN ('active','trialing')
       ORDER BY s.id DESC LIMIT 1`,
      [user.tenant_id]
    );
    if (sub) {
      plan = { features: sub.features || {}, limits: { max_orders_monthly: sub.max_orders_monthly }, plan_name: sub.plan_name };
    }
  }

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, tenant_id: user.tenant_id },
    tenant,
    plan,
  });
});

// GET /auth/tenant-info — branding tenant'а для сабдомена (публичный)
router.get('/tenant-info', async (req, res) => {
  if (!req.subdomainTenant) {
    return res.status(400).json({ error: 'Доступно только на сабдомене заведения' });
  }
  res.json({
    name: req.subdomainTenant.name,
    slug: req.subdomainTenant.slug,
    logo_url: req.subdomainTenant.logo_url,
    accent_color: req.subdomainTenant.accent_color,
  });
});

router.get('/me', authMiddleware, async (req, res) => {
  let tenant = null;
  if (req.user.tenant_id) {
    tenant = await get(
      'SELECT id, name, slug, logo_url, accent_color FROM tenants WHERE id = $1',
      [req.user.tenant_id]
    );
  }
  let chain = null;
  if (req.user.chain_id) {
    chain = await get('SELECT id, name FROM chains WHERE id = $1', [req.user.chain_id]);
  }

  let plan = null;
  if (req.user.tenant_id) {
    const sub = await get(
      `SELECT p.features, p.max_orders_monthly, p.name as plan_name
       FROM subscriptions s JOIN plans p ON s.plan_id = p.id
       WHERE s.tenant_id = $1 AND s.status IN ('active','trialing')
       ORDER BY s.id DESC LIMIT 1`,
      [req.user.tenant_id]
    );
    if (sub) {
      plan = { features: sub.features || {}, limits: { max_orders_monthly: sub.max_orders_monthly }, plan_name: sub.plan_name };
    }
  }

  res.json({
    user: {
      id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role,
      tenant_id: req.user.tenant_id, chain_id: req.user.chain_id || null,
      superadmin_impersonating: !!req.user.superadmin_impersonating,
      chain_impersonating: !!req.user.chain_impersonating,
    },
    tenant,
    chain,
    plan,
  });
});

module.exports = router;
