const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { all, get, run } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { checkSubscription, checkLimit } = require('../middleware/subscription');
const { invalidateUser, invalidateResourceCount } = require('../cache');

const router = express.Router();
router.use(authMiddleware, adminOnly, checkSubscription);

// Проверка уникальности PIN внутри tenant'а
async function isPinUnique(pin, tenantId, excludeUserId) {
  const users = await all(
    'SELECT id, pin_hash FROM users WHERE tenant_id = $1 AND pin_hash IS NOT NULL AND active = true',
    [tenantId]
  );
  for (const u of users) {
    if (excludeUserId && u.id === excludeUserId) continue;
    const match = await bcrypt.compare(pin, u.pin_hash);
    if (match) return false;
  }
  return true;
}

router.get('/', async (req, res) => {
  const users = await all(
    'SELECT id, username, email, name, role, active, created_at, (pin_hash IS NOT NULL) AS has_pin FROM users WHERE tenant_id = $1 ORDER BY id',
    [req.tenantId]
  );
  res.json(users);
});

router.post('/', checkLimit('users'), async (req, res) => {
  const { email, username, password, name, role, pin } = req.body;
  const nameStr = typeof name === 'string' ? name.trim() : '';
  if (!nameStr) return res.status(400).json({ error: 'Укажите имя' });

  // Если передан PIN — создаём сотрудника по имени + PIN
  if (pin !== undefined && pin !== null && pin !== '') {
    const pinStr = String(pin);
    if (!/^\d{4}$/.test(pinStr)) {
      return res.status(400).json({ error: 'PIN-код должен быть 4 цифры' });
    }

    const unique = await isPinUnique(pinStr, req.tenantId);
    if (!unique) {
      return res.status(400).json({ error: 'Этот PIN-код уже используется другим сотрудником' });
    }

    const pinHash = await bcrypt.hash(pinStr, 10);
    // Автогенерация username и случайного пароля (сотрудник их не использует)
    const autoUsername = nameStr.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '') + '.' + Date.now();
    const autoPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);

    const result = await run(
      'INSERT INTO users (email, username, password, name, role, tenant_id, pin_hash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [autoUsername + '@pin.local', autoUsername, autoPassword, nameStr, role || 'cashier', req.tenantId, pinHash]
    );
    invalidateResourceCount(req.tenantId, 'users');
    return res.json({ id: result.id, name: nameStr, role: role || 'cashier', has_pin: true });
  }

  // Старый путь: создание по email + password
  const login = [email, username].find(Boolean);
  const loginStr = typeof login === 'string' ? login.trim() : '';
  const passStr = typeof password === 'string' ? password : '';

  if (!loginStr) return res.status(400).json({ error: 'Укажите логин (email)' });
  if (!passStr) return res.status(400).json({ error: 'Укажите пароль' });

  const exists = await get('SELECT id FROM users WHERE email = $1', [loginStr]);
  if (exists) {
    return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
  }
  const hash = await bcrypt.hash(passStr, 10);
  const result = await run(
    'INSERT INTO users (email, username, password, name, role, tenant_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [loginStr, loginStr, hash, nameStr, role || 'cashier', req.tenantId]
  );
  invalidateResourceCount(req.tenantId, 'users');
  res.json({ id: result.id, email: loginStr, name: nameStr, role: role || 'cashier' });
});

router.put('/:id', async (req, res) => {
  const { name, role, active, password, pin } = req.body;
  const user = await get('SELECT id FROM users WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await run('UPDATE users SET password = $1 WHERE id = $2 AND tenant_id = $3', [hash, req.params.id, req.tenantId]);
  }

  // Обновление PIN
  if (pin !== undefined && pin !== null && pin !== '') {
    const pinStr = String(pin);
    if (!/^\d{4}$/.test(pinStr)) {
      return res.status(400).json({ error: 'PIN-код должен быть 4 цифры' });
    }
    const unique = await isPinUnique(pinStr, req.tenantId, parseInt(req.params.id));
    if (!unique) {
      return res.status(400).json({ error: 'Этот PIN-код уже используется другим сотрудником' });
    }
    const pinHash = await bcrypt.hash(pinStr, 10);
    await run('UPDATE users SET pin_hash = $1 WHERE id = $2 AND tenant_id = $3', [pinHash, req.params.id, req.tenantId]);
  }

  if (name !== undefined) await run('UPDATE users SET name = $1 WHERE id = $2 AND tenant_id = $3', [name, req.params.id, req.tenantId]);
  if (role !== undefined) await run('UPDATE users SET role = $1 WHERE id = $2 AND tenant_id = $3', [role, req.params.id, req.tenantId]);
  if (active !== undefined) await run('UPDATE users SET active = $1 WHERE id = $2 AND tenant_id = $3', [active, req.params.id, req.tenantId]);

  invalidateUser(parseInt(req.params.id));
  if (active !== undefined) invalidateResourceCount(req.tenantId, 'users');
  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  await run('UPDATE users SET active = false WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  invalidateUser(parseInt(req.params.id));
  invalidateResourceCount(req.tenantId, 'users');
  res.json({ success: true });
});

module.exports = router;
