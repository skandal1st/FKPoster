const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { get, run } = require('./db');
const { userById } = require('./cache');

async function setupSocket(httpServer) {
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

  // Redis adapter для кластерного режима (PM2)
  if (process.env.REDIS_URL) {
    try {
      const { createClient } = require('redis');
      const { createAdapter } = require('@socket.io/redis-adapter');
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('Socket.io Redis adapter connected');
    } catch (err) {
      console.error('Socket.io Redis adapter failed, falling back to in-memory:', err.message);
    }
  }

  // JWT auth middleware for socket.io (поддерживает user-токены и device-токены bridge-клиентов)
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Требуется авторизация'));
    }

    try {
      const payload = jwt.verify(token, config.JWT_SECRET);

      // ── Device token (bridge-клиент физической ККТ) ───────────────────────
      if (payload.device_id && payload.tenant_id && !payload.id) {
        const device = await get(
          'SELECT device_id, tenant_id FROM kkt_physical_devices WHERE device_id = $1 AND tenant_id = $2',
          [payload.device_id, payload.tenant_id]
        );
        if (!device) return next(new Error('Устройство не найдено'));
        socket.deviceId = device.device_id;
        socket.tenantId = device.tenant_id;
        socket.isDevice = true;
        return next();
      }

      // ── User token (веб/мобильный клиент) ────────────────────────────────
      let user = userById.get(payload.id);
      if (user === undefined) {
        user = await get(
          'SELECT id, email, name, role, tenant_id, chain_id FROM users WHERE id = $1 AND active = true',
          [payload.id]
        );
        userById.set(payload.id, user);
      }
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

  io.on('connection', async (socket) => {
    if (socket.isDevice) {
      // Bridge-устройство: присоединяем к персональной комнате и комнате тенанта
      socket.join(`device:${socket.deviceId}`);
      socket.join(`tenant:${socket.tenantId}`);

      // Обновить статус устройства на "online"
      try {
        await run(
          `UPDATE kkt_physical_devices SET status = 'online', last_seen_at = NOW()
           WHERE device_id = $1`,
          [socket.deviceId]
        );
      } catch { /* non-critical */ }

      socket.on('disconnect', async () => {
        try {
          await run(
            `UPDATE kkt_physical_devices SET status = 'offline'
             WHERE device_id = $1`,
            [socket.deviceId]
          );
        } catch { /* non-critical */ }
      });
    } else {
      // Обычный пользователь
      if (socket.tenantId) {
        socket.join(`tenant:${socket.tenantId}`);
      }

      socket.on('disconnect', () => {
        // cleanup handled automatically by socket.io
      });
    }
  });

  return io;
}

module.exports = { setupSocket };
