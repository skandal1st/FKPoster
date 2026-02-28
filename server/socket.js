const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { get } = require('./db');

function setupSocket(httpServer) {
  const baseDomain = config.BASE_DOMAIN;

  const io = new Server(httpServer, {
    cors: {
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        let hostname;
        try {
          hostname = new URL(origin).hostname;
        } catch {
          return callback(null, false);
        }
        const allowed =
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === baseDomain ||
          hostname.endsWith('.' + baseDomain);
        callback(null, allowed);
      },
      credentials: true,
    },
  });

  // JWT auth middleware for socket.io
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Требуется авторизация'));
    }

    try {
      const payload = jwt.verify(token, config.JWT_SECRET);
      const user = await get(
        'SELECT id, email, name, role, tenant_id, chain_id FROM users WHERE id = $1 AND active = true',
        [payload.id],
      );
      if (!user) {
        return next(new Error('Пользователь не найден'));
      }

      // Determine tenantId (same logic as auth middleware)
      let tenantId;
      if (payload.superadmin_impersonating && payload.tenant_id && user.role === 'superadmin') {
        tenantId = payload.tenant_id;
      } else if (payload.chain_impersonating && payload.tenant_id && payload.chain_id) {
        tenantId = payload.tenant_id;
      } else {
        tenantId = user.tenant_id;
      }

      socket.user = user;
      socket.tenantId = tenantId;
      next();
    } catch {
      next(new Error('Неверный токен'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.tenantId) {
      socket.join(`tenant:${socket.tenantId}`);
    }

    socket.on('disconnect', () => {
      // cleanup handled automatically by socket.io
    });
  });

  return io;
}

module.exports = { setupSocket };
