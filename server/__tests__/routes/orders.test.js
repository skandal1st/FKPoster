import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';

const SECRET = 'test-secret';
const { db } = globalThis.__mocks;

const orderRoutes = (await import('../../routes/orders.js')).default;

function makeToken(payload = { id: 1, role: 'cashier', tenant_id: 1 }) {
  return jwt.sign(payload, SECRET, { expiresIn: '1h' });
}

const defaultUser = { id: 1, email: 'test@t.com', name: 'Test', role: 'cashier', tenant_id: 1, chain_id: null, username: 'test' };
const defaultToken = makeToken();

function buildApp() {
  const app = express();
  app.use(express.json());
  // Subdomain middleware (required by auth routes to not crash)
  app.use((req, _res, next) => {
    req.subdomainTenant = null;
    req.isMainDomain = true;
    next();
  });
  app.use('/api/orders', orderRoutes);
  app.use((err, _req, res, _next) => {
    console.error('Test error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  return app;
}

/**
 * Helper: set up db.get mock to first return the user (for authMiddleware),
 * then the subscription (for checkSubscription), then the rest.
 */
function mockAuthAndSubscription(...subsequentGetCalls) {
  // authMiddleware: find user by id
  db.get.mockResolvedValueOnce(defaultUser);
  // checkSubscription: find active subscription
  db.get.mockResolvedValueOnce({
    id: 1, plan_name: 'start', max_users: 99, max_halls: 99, max_products: 999,
    current_period_end: new Date(Date.now() + 86400000).toISOString(),
    plan_features: {},
  });
  // loadIntegrations: find tenant integrations
  db.get.mockResolvedValueOnce({ egais_enabled: false, chestniy_znak_enabled: false });
  // subsequent calls for the route handler
  for (const call of subsequentGetCalls) {
    db.get.mockResolvedValueOnce(call);
  }
}

describe('POST /api/orders (create)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if no register day is open', async () => {
    mockAuthAndSubscription(null); // no open register day
    const app = buildApp();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${defaultToken}`)
      .send({ table_id: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('кассовый день');
  });

  it('creates order successfully', async () => {
    const order = { id: 1, table_id: null, status: 'open', tenant_id: 1 };
    mockAuthAndSubscription(
      { id: 10 }, // register day
    );
    db.run.mockResolvedValueOnce({ id: 1 }); // insert
    db.get.mockResolvedValueOnce(order); // select created order

    const app = buildApp();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${defaultToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.items).toEqual([]);
  });
});

describe('POST /api/orders/:id/close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if order not found or already closed', async () => {
    mockAuthAndSubscription(null); // order not found
    const app = buildApp();
    const res = await request(app)
      .post('/api/orders/1/close')
      .set('Authorization', `Bearer ${defaultToken}`)
      .send({ payment_method: 'cash' });
    expect(res.status).toBe(400);
  });

  it('returns 400 without payment_method', async () => {
    mockAuthAndSubscription({ id: 1, status: 'open', tenant_id: 1, register_day_id: 10 });
    const app = buildApp();
    const res = await request(app)
      .post('/api/orders/1/close')
      .set('Authorization', `Bearer ${defaultToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('способ оплаты');
  });

  it('returns 400 for invalid payment_method', async () => {
    mockAuthAndSubscription({ id: 1, status: 'open', tenant_id: 1 });
    const app = buildApp();
    const res = await request(app)
      .post('/api/orders/1/close')
      .set('Authorization', `Bearer ${defaultToken}`)
      .send({ payment_method: 'bitcoin' });
    expect(res.status).toBe(400);
  });

  it('returns 400 if order has no items', async () => {
    mockAuthAndSubscription({ id: 1, status: 'open', tenant_id: 1, register_day_id: 10 });
    db.all.mockResolvedValueOnce([]); // no items
    const app = buildApp();
    const res = await request(app)
      .post('/api/orders/1/close')
      .set('Authorization', `Bearer ${defaultToken}`)
      .send({ payment_method: 'cash' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('пуст');
  });

  it('closes order with cash payment', async () => {
    const items = [
      { id: 1, product_id: 1, product_name: 'Hookah', quantity: 1, price: '1000.00', total: '1000.00', marking_type: 'none' },
    ];
    const closedOrder = { id: 1, status: 'closed', total: '1000.00', payment_method: 'cash' };

    mockAuthAndSubscription({ id: 1, status: 'open', tenant_id: 1, register_day_id: 10 });
    db.all.mockResolvedValueOnce(items);

    db.transaction.mockImplementation(async (cb) => {
      const tx = {
        run: vi.fn(),
        all: vi.fn().mockResolvedValue([]),
        get: vi.fn()
          .mockResolvedValueOnce({ id: 1, is_composite: false, track_inventory: true })
          .mockResolvedValueOnce({ id: 10, total_cash: 0, total_card: 0, expected_cash: 0, total_sales: 0 }),
      };
      return cb(tx);
    });

    db.get.mockResolvedValueOnce(closedOrder);
    db.all.mockResolvedValueOnce(items);

    const app = buildApp();
    const res = await request(app)
      .post('/api/orders/1/close')
      .set('Authorization', `Bearer ${defaultToken}`)
      .send({ payment_method: 'cash' });
    expect(res.status).toBe(200);
  });

  it('returns 400 for mixed payment with wrong sum', async () => {
    const items = [
      { id: 1, product_id: 1, product_name: 'Hookah', quantity: 1, price: '1000.00', total: '1000.00', marking_type: 'none' },
    ];
    mockAuthAndSubscription({ id: 1, status: 'open', tenant_id: 1, register_day_id: 10 });
    db.all.mockResolvedValueOnce(items);

    const app = buildApp();
    const res = await request(app)
      .post('/api/orders/1/close')
      .set('Authorization', `Bearer ${defaultToken}`)
      .send({
        payment_method: 'mixed',
        paid_cash: 300,
        paid_card: 500,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('не совпадает');
  });
});

describe('POST /api/orders/:id/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if order not found', async () => {
    mockAuthAndSubscription(null);
    const app = buildApp();
    const res = await request(app)
      .post('/api/orders/1/cancel')
      .set('Authorization', `Bearer ${defaultToken}`);
    expect(res.status).toBe(400);
  });

  it('cancels order successfully', async () => {
    mockAuthAndSubscription({ id: 1, status: 'open', tenant_id: 1 });
    db.run.mockResolvedValueOnce({});
    const app = buildApp();
    const res = await request(app)
      .post('/api/orders/1/cancel')
      .set('Authorization', `Bearer ${defaultToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Multi-tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cannot access order from another tenant', async () => {
    const otherUser = { ...defaultUser, id: 2, tenant_id: 2 };
    const otherToken = makeToken({ id: 2, role: 'cashier', tenant_id: 2 });
    // authMiddleware: find user
    db.get.mockResolvedValueOnce(otherUser);
    // checkSubscription
    db.get.mockResolvedValueOnce({
      id: 1, plan_name: 'start', max_users: 99, current_period_end: new Date(Date.now() + 86400000).toISOString(),
      plan_features: {},
    });
    // loadIntegrations
    db.get.mockResolvedValueOnce({ egais_enabled: false, chestniy_znak_enabled: false });
    // order not found for tenant_id=2
    db.get.mockResolvedValueOnce(null);

    const app = buildApp();
    const res = await request(app)
      .post('/api/orders/1/close')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ payment_method: 'cash' });
    expect(res.status).toBe(400);
  });
});
