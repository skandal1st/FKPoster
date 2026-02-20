const express = require('express');
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription, checkLimit } = require('../middleware/subscription');

const router = express.Router();
router.use(authMiddleware, adminOnly, checkSubscription);

router.get('/', async (req, res) => {
  const users = await all(
    'SELECT id, username, email, name, role, active, created_at FROM users WHERE tenant_id = $1 ORDER BY id',
    [req.tenantId]
  );
  res.json(users);
});

router.post('/', checkLimit('users'), async (req, res) => {
  const { email, username, password, name, role } = req.body;
  const login = [email, username].find(Boolean);
  const loginStr = typeof login === 'string' ? login.trim() : '';
  const nameStr = typeof name === 'string' ? name.trim() : '';
  const passStr = typeof password === 'string' ? password : '';

  if (!loginStr) return res.status(400).json({ error: 'Укажите логин (email)' });
  if (!passStr) return res.status(400).json({ error: 'Укажите пароль' });
  if (!nameStr) return res.status(400).json({ error: 'Укажите имя' });

  const exists = await get('SELECT id FROM users WHERE email = $1', [loginStr]);
  if (exists) {
    return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
  }
  const hash = await bcrypt.hash(passStr, 10);
  const result = await run(
    'INSERT INTO users (email, username, password, name, role, tenant_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [loginStr, loginStr, hash, nameStr, role || 'cashier', req.tenantId]
  );
  res.json({ id: result.id, email: loginStr, name: nameStr, role: role || 'cashier' });
});

router.put('/:id', async (req, res) => {
  const { name, role, active, password } = req.body;
  const user = await get('SELECT id FROM users WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await run('UPDATE users SET password = $1 WHERE id = $2 AND tenant_id = $3', [hash, req.params.id, req.tenantId]);
  }
  if (name !== undefined) await run('UPDATE users SET name = $1 WHERE id = $2 AND tenant_id = $3', [name, req.params.id, req.tenantId]);
  if (role !== undefined) await run('UPDATE users SET role = $1 WHERE id = $2 AND tenant_id = $3', [role, req.params.id, req.tenantId]);
  if (active !== undefined) await run('UPDATE users SET active = $1 WHERE id = $2 AND tenant_id = $3', [active, req.params.id, req.tenantId]);

  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  await run('UPDATE users SET active = false WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  res.json({ success: true });
});

module.exports = router;
