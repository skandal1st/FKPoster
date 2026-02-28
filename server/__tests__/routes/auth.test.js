import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import express from 'express';

const SECRET = 'test-secret';
const { db } = globalThis.__mocks;

const authRoutes = (await import('../../routes/auth.js')).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.subdomainTenant = null;
    req.isMainDomain = true;
    next();
  });
  app.use('/api/auth', authRoutes);
  app.use((err, _req, res, _next) => {
    console.error('Test error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  return app;
}

function buildSubdomainApp(tenant = { id: 1, name: 'Test Bar', slug: 'test', logo_url: null, accent_color: '#6366f1' }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.subdomainTenant = tenant;
    req.isMainDomain = false;
    next();
  });
  app.use('/api/auth', authRoutes);
  app.use((err, _req, res, _next) => {
    console.error('Test error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  return app;
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 without email or password', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for non-existent user', async () => {
    db.get.mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'nope@test.com', password: '123456' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    const hash = await bcrypt.hash('correct', 10);
    db.get.mockResolvedValue({ id: 1, email: 'u@test.com', name: 'U', role: 'owner', tenant_id: 1, password: hash });
    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'u@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns token for valid credentials', async () => {
    const hash = await bcrypt.hash('pass123', 10);
    const user = { id: 1, email: 'u@test.com', name: 'U', role: 'owner', tenant_id: 1, chain_id: null, password: hash };
    const tenant = { id: 1, name: 'Bar', slug: 'bar', logo_url: null, accent_color: '#000' };
    db.get.mockResolvedValueOnce(user).mockResolvedValueOnce(tenant);

    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'u@test.com', password: 'pass123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('u@test.com');
    expect(res.body.tenant.slug).toBe('bar');

    const payload = jwt.verify(res.body.token, SECRET);
    expect(payload.id).toBe(1);
  });
});

describe('GET /api/auth/employees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on main domain (no subdomain)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/auth/employees');
    expect(res.status).toBe(400);
  });

  it('returns employee list on subdomain', async () => {
    const employees = [
      { id: 1, name: 'Alice', role: 'cashier' },
      { id: 2, name: 'Bob', role: 'admin' },
    ];
    db.all.mockResolvedValue(employees);
    const app = buildSubdomainApp();
    const res = await request(app).get('/api/auth/employees');
    expect(res.status).toBe(200);
    expect(res.body.employees).toHaveLength(2);
    expect(res.body.tenant.name).toBe('Test Bar');
  });
});

describe('POST /api/auth/pin-login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on main domain', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/pin-login').send({ user_id: 1, pin: '1234' });
    expect(res.status).toBe(400);
  });

  it('returns 400 without user_id or pin', async () => {
    const app = buildSubdomainApp();
    const res = await request(app).post('/api/auth/pin-login').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid user', async () => {
    db.get.mockResolvedValue(null);
    const app = buildSubdomainApp();
    const res = await request(app).post('/api/auth/pin-login').send({ user_id: 999, pin: '1234' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong PIN', async () => {
    const hash = await bcrypt.hash('1234', 10);
    db.get.mockResolvedValue({ id: 1, email: 'u@test.com', name: 'U', role: 'cashier', tenant_id: 1, pin_hash: hash });
    const app = buildSubdomainApp();
    const res = await request(app).post('/api/auth/pin-login').send({ user_id: 1, pin: '9999' });
    expect(res.status).toBe(401);
  });

  it('returns token for valid PIN', async () => {
    const hash = await bcrypt.hash('1234', 10);
    const user = { id: 1, email: 'u@test.com', name: 'U', role: 'cashier', tenant_id: 1, pin_hash: hash };
    const tenant = { id: 1, name: 'Bar', slug: 'bar', logo_url: null, accent_color: '#000' };
    db.get.mockResolvedValueOnce(user).mockResolvedValueOnce(tenant);

    const app = buildSubdomainApp();
    const res = await request(app).post('/api/auth/pin-login').send({ user_id: 1, pin: '1234' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.name).toBe('U');
  });
});
