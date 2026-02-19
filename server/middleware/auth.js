const jwt = require('jsonwebtoken');
const { get } = require('../db');
const config = require('../config');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, config.JWT_SECRET);
    const user = await get(
      'SELECT id, email, username, name, role, tenant_id FROM users WHERE id = $1 AND active = true',
      [payload.id]
    );
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    req.user = user;
    req.tenantId = user.tenant_id;
    next();
  } catch {
    return res.status(401).json({ error: 'Неверный токен' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Доступ только для администраторов' });
  }
  next();
}

function ownerOnly(req, res, next) {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Доступ только для владельца' });
  }
  next();
}

module.exports = { authMiddleware, adminOnly, ownerOnly };
