const jwt = require('jsonwebtoken');
const { get } = require('../db');
const config = require('../config');
const { userById } = require('../cache');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, config.JWT_SECRET);
    let user = userById.get(payload.id);
    if (user === undefined) {
      user = await get(
        'SELECT id, email, username, name, role, tenant_id, chain_id FROM users WHERE id = $1 AND active = true',
        [payload.id]
      );
      userById.set(payload.id, user);
    }
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    req.user = user;
    // Суперадмин может работать «от имени» заведения (имперсонация)
    if (payload.superadmin_impersonating && payload.tenant_id && user.role === 'superadmin') {
      req.user = { ...user, tenant_id: payload.tenant_id, role: 'owner', superadmin_impersonating: true };
      req.tenantId = payload.tenant_id;
    // Владелец сети может работать «от имени» заведения сети
    } else if (payload.chain_impersonating && payload.tenant_id && payload.chain_id && (user.role === 'chain_owner' || (user.role === 'owner' && user.chain_id))) {
      req.user = { ...user, tenant_id: payload.tenant_id, role: 'owner', chain_impersonating: true };
      req.tenantId = payload.tenant_id;
      req.chainId = payload.chain_id;
    } else {
      req.tenantId = user.tenant_id;
      if (user.chain_id) {
        req.chainId = user.chain_id;
      }
    }
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

function superadminOnly(req, res, next) {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Доступ только для суперадмина' });
  }
  next();
}

function chainOwnerOnly(req, res, next) {
  // Разрешаем и chain_owner, и owner с chain_id (Business plan)
  if (req.user.role === 'chain_owner') return next();
  if (req.user.role === 'owner' && req.chainId) return next();
  return res.status(403).json({ error: 'Доступ только для владельца сети' });
}

module.exports = { authMiddleware, adminOnly, ownerOnly, superadminOnly, chainOwnerOnly };
