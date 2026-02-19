const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const config = require('../config');

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

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, tenant_id: user.tenant_id },
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

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, tenant_id: user.tenant_id },
    tenant,
  });
});

router.post('/register', async (req, res) => {
  const { company_name, name, email, password } = req.body;
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
  const result = await transaction(async (tx) => {
    const slug = company_name.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '-').replace(/-+/g, '-').substring(0, 100);
    const tenantRes = await tx.run(
      'INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id',
      [company_name, slug + '-' + Date.now()]
    );
    const tenantId = tenantRes.id;

    const hash = await bcrypt.hash(password, 10);
    const userRes = await tx.run(
      'INSERT INTO users (email, username, password, name, role, tenant_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [email, email, hash, name, 'owner', tenantId]
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

router.get('/me', authMiddleware, async (req, res) => {
  let tenant = null;
  if (req.user.tenant_id) {
    tenant = await get(
      'SELECT id, name, slug, logo_url, accent_color FROM tenants WHERE id = $1',
      [req.user.tenant_id]
    );
  }
  res.json({
    user: { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role, tenant_id: req.user.tenant_id },
    tenant,
  });
});

module.exports = router;
