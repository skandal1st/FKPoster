import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import express from 'express';

const SECRET = 'test-secret';
const { db } = globalThis.__mocks;

const { authMiddleware, adminOnly, ownerOnly, superadminOnly } = await import('../../middleware/auth.js');

function makeToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '1h' });
}

function buildApp(...middlewares) {
  const app = express();
  app.use(express.json());
  app.get('/test', ...middlewares, (req, res) => {
    res.json({
      user: req.user,
      tenantId: req.tenantId,
      chainId: req.chainId,
    });
  });
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without Authorization header', async () => {
    const app = buildApp(authMiddleware);
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Требуется авторизация');
  });

  it('returns 401 with invalid JWT', async () => {
    const app = buildApp(authMiddleware);
    const res = await request(app).get('/test').set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Неверный токен');
  });

  it('returns 401 if user not found', async () => {
    db.get.mockResolvedValue(null);
    const token = makeToken({ id: 999, role: 'cashier', tenant_id: 1 });
    const app = buildApp(authMiddleware);
    const res = await request(app).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Пользователь не найден');
  });

  it('sets req.user and req.tenantId for normal user', async () => {
    const user = { id: 1, email: 'test@test.com', name: 'Test', role: 'cashier', tenant_id: 5, chain_id: null };
    db.get.mockResolvedValue(user);
    const token = makeToken({ id: 1, role: 'cashier', tenant_id: 5 });
    const app = buildApp(authMiddleware);

    const res = await request(app).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(1);
    expect(res.body.tenantId).toBe(5);
  });

  it('handles superadmin impersonation', async () => {
    const user = { id: 1, email: 'admin@test.com', name: 'Admin', role: 'superadmin', tenant_id: null, chain_id: null };
    db.get.mockResolvedValue(user);
    const token = makeToken({ id: 1, role: 'superadmin', superadmin_impersonating: true, tenant_id: 42 });
    const app = buildApp(authMiddleware);

    const res = await request(app).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(42);
    expect(res.body.user.role).toBe('owner');
    expect(res.body.user.superadmin_impersonating).toBe(true);
  });
});

describe('adminOnly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows admin', async () => {
    db.get.mockResolvedValue({ id: 1, email: 'a@a.com', name: 'A', role: 'admin', tenant_id: 1, chain_id: null });
    const token = makeToken({ id: 1, role: 'admin', tenant_id: 1 });
    const app = buildApp(authMiddleware, adminOnly);
    const res = await request(app).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('allows owner', async () => {
    db.get.mockResolvedValue({ id: 1, email: 'o@o.com', name: 'O', role: 'owner', tenant_id: 1, chain_id: null });
    const token = makeToken({ id: 1, role: 'owner', tenant_id: 1 });
    const app = buildApp(authMiddleware, adminOnly);
    const res = await request(app).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('blocks cashier with 403', async () => {
    db.get.mockResolvedValue({ id: 1, email: 'c@c.com', name: 'C', role: 'cashier', tenant_id: 1, chain_id: null });
    const token = makeToken({ id: 1, role: 'cashier', tenant_id: 1 });
    const app = buildApp(authMiddleware, adminOnly);
    const res = await request(app).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('ownerOnly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows owner', async () => {
    db.get.mockResolvedValue({ id: 1, email: 'o@o.com', name: 'O', role: 'owner', tenant_id: 1, chain_id: null });
    const token = makeToken({ id: 1, role: 'owner', tenant_id: 1 });
    const app = buildApp(authMiddleware, ownerOnly);
    const res = await request(app).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('blocks admin with 403', async () => {
    db.get.mockResolvedValue({ id: 1, email: 'a@a.com', name: 'A', role: 'admin', tenant_id: 1, chain_id: null });
    const token = makeToken({ id: 1, role: 'admin', tenant_id: 1 });
    const app = buildApp(authMiddleware, ownerOnly);
    const res = await request(app).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('superadminOnly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows superadmin', async () => {
    db.get.mockResolvedValue({ id: 1, email: 's@s.com', name: 'S', role: 'superadmin', tenant_id: null, chain_id: null });
    const token = makeToken({ id: 1, role: 'superadmin' });
    const app = buildApp(authMiddleware, superadminOnly);
    const res = await request(app).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('blocks owner with 403', async () => {
    db.get.mockResolvedValue({ id: 1, email: 'o@o.com', name: 'O', role: 'owner', tenant_id: 1, chain_id: null });
    const token = makeToken({ id: 1, role: 'owner', tenant_id: 1 });
    const app = buildApp(authMiddleware, superadminOnly);
    const res = await request(app).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
