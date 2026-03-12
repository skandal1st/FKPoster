const express = require('express');
const crypto = require('crypto');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly, ownerOnly } = require('../middleware/auth');
const { invalidateTenant } = require('../cache');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const tenant = await get(
    `SELECT id, name, slug, logo_url, accent_color, day_end_hour, show_table_timer, created_at,
      business_type, pos_mode, theme,
      legal_name, inn, kpp, ogrn, legal_address, actual_address, director_name,
      bank_name, bank_bik, bank_account, bank_corr_account
     FROM tenants WHERE id = $1`,
    [req.tenantId]
  );
  if (!tenant) return res.status(404).json({ error: 'Компания не найдена' });
  res.json(tenant);
});

router.put('/', ownerOnly, async (req, res) => {
  const { name, logo_url, accent_color, day_end_hour, show_table_timer,
    business_type, pos_mode, theme,
    legal_name, inn, kpp, ogrn, legal_address, actual_address, director_name,
    bank_name, bank_bik, bank_account, bank_corr_account } = req.body;
  const tenant = await get('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (!tenant) return res.status(404).json({ error: 'Компания не найдена' });

  const newDayEndHour = day_end_hour !== undefined ? Math.max(0, Math.min(12, parseInt(day_end_hour) || 0)) : tenant.day_end_hour;
  const validTypes = ['hookah', 'coffee', 'fastfood', 'restaurant'];
  const validModes = ['table_service', 'fast_pos'];
  const validThemes = ['dark', 'light'];

  await run(
    `UPDATE tenants SET name = $1, logo_url = $2, accent_color = $3, day_end_hour = $4,
      legal_name = $5, inn = $6, kpp = $7, ogrn = $8,
      legal_address = $9, actual_address = $10, director_name = $11,
      bank_name = $12, bank_bik = $13, bank_account = $14, bank_corr_account = $15,
      show_table_timer = $16,
      business_type = $17, pos_mode = $18, theme = $19
     WHERE id = $20`,
    [
      name || tenant.name,
      logo_url !== undefined ? logo_url : tenant.logo_url,
      accent_color || tenant.accent_color,
      newDayEndHour,
      legal_name !== undefined ? legal_name : tenant.legal_name,
      inn !== undefined ? inn : tenant.inn,
      kpp !== undefined ? kpp : tenant.kpp,
      ogrn !== undefined ? ogrn : tenant.ogrn,
      legal_address !== undefined ? legal_address : tenant.legal_address,
      actual_address !== undefined ? actual_address : tenant.actual_address,
      director_name !== undefined ? director_name : tenant.director_name,
      bank_name !== undefined ? bank_name : tenant.bank_name,
      bank_bik !== undefined ? bank_bik : tenant.bank_bik,
      bank_account !== undefined ? bank_account : tenant.bank_account,
      bank_corr_account !== undefined ? bank_corr_account : tenant.bank_corr_account,
      show_table_timer !== undefined ? show_table_timer : tenant.show_table_timer,
      validTypes.includes(business_type) ? business_type : tenant.business_type,
      validModes.includes(pos_mode) ? pos_mode : tenant.pos_mode,
      validThemes.includes(theme) ? theme : tenant.theme,
      req.tenantId,
    ]
  );

  const updated = await get(
    `SELECT id, name, slug, logo_url, accent_color, day_end_hour, show_table_timer,
      business_type, pos_mode, theme,
      legal_name, inn, kpp, ogrn, legal_address, actual_address, director_name,
      bank_name, bank_bik, bank_account, bank_corr_account
     FROM tenants WHERE id = $1`,
    [req.tenantId]
  );
  invalidateTenant(tenant.slug);
  res.json(updated);
});

router.post('/invite', adminOnly, async (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Введите email' });

  const existingUser = await get('SELECT id FROM users WHERE email = $1', [email]);
  if (existingUser) {
    return res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован' });
  }

  const existingInvite = await get(
    'SELECT id FROM invitations WHERE email = $1 AND tenant_id = $2 AND accepted = false AND expires_at > NOW()',
    [email, req.tenantId]
  );
  if (existingInvite) {
    return res.status(400).json({ error: 'Приглашение уже отправлено' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const validRole = ['admin', 'cashier'].includes(role) ? role : 'cashier';

  const result = await run(
    "INSERT INTO invitations (tenant_id, email, role, token, expires_at, created_by) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days', $5) RETURNING id",
    [req.tenantId, email, validRole, token, req.user.id]
  );

  res.json({ id: result.id, token, email, role: validRole });
});

router.get('/users', adminOnly, async (req, res) => {
  const users = await all(
    'SELECT id, email, name, role, active, created_at FROM users WHERE tenant_id = $1 ORDER BY id',
    [req.tenantId]
  );
  const invitations = await all(
    'SELECT id, email, role, accepted, expires_at, created_by FROM invitations WHERE tenant_id = $1 ORDER BY id DESC',
    [req.tenantId]
  );
  res.json({ users, invitations });
});

// ── Print settings ──

router.get('/print-settings', async (req, res) => {
  const row = await get(
    'SELECT receipt_width, receipt_header, receipt_footer, auto_print_receipt FROM tenant_print_settings WHERE tenant_id = $1',
    [req.tenantId]
  );
  res.json(row || { receipt_width: '80mm', receipt_header: '', receipt_footer: 'Спасибо за визит!', auto_print_receipt: false });
});

router.put('/print-settings', ownerOnly, async (req, res) => {
  const { receipt_width, receipt_header, receipt_footer, auto_print_receipt } = req.body;

  if (receipt_width && !['58mm', '80mm'].includes(receipt_width)) {
    return res.status(400).json({ error: 'Ширина чека должна быть 58mm или 80mm' });
  }

  const existing = await get('SELECT id FROM tenant_print_settings WHERE tenant_id = $1', [req.tenantId]);
  if (existing) {
    await run(
      `UPDATE tenant_print_settings SET receipt_width = $1, receipt_header = $2, receipt_footer = $3, auto_print_receipt = $4, updated_at = NOW() WHERE tenant_id = $5`,
      [receipt_width || '80mm', receipt_header ?? '', receipt_footer ?? 'Спасибо за визит!', auto_print_receipt ?? false, req.tenantId]
    );
  } else {
    await run(
      `INSERT INTO tenant_print_settings (tenant_id, receipt_width, receipt_header, receipt_footer, auto_print_receipt) VALUES ($1, $2, $3, $4, $5)`,
      [req.tenantId, receipt_width || '80mm', receipt_header ?? '', receipt_footer ?? 'Спасибо за визит!', auto_print_receipt ?? false]
    );
  }

  res.json({ success: true });
});

module.exports = router;
