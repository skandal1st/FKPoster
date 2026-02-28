import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db } = globalThis.__mocks;

// Import after setup.js has intercepted require()
const { checkSubscription, checkLimit } = await import('../../middleware/subscription.js');

function mockReqRes(overrides = {}) {
  const req = { tenantId: 1, plan: null, ...overrides };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('checkSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next if no tenantId', async () => {
    const { req, res, next } = mockReqRes({ tenantId: undefined });
    await checkSubscription(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 402 if no active subscription', async () => {
    db.get.mockResolvedValue(null);
    const { req, res, next } = mockReqRes();
    await checkSubscription(req, res, next);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 402 if subscription expired', async () => {
    db.get.mockResolvedValue({
      current_period_end: '2020-01-01T00:00:00Z',
      plan_name: 'start',
    });
    const { req, res, next } = mockReqRes();
    await checkSubscription(req, res, next);
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it('sets req.plan and calls next for valid subscription', async () => {
    const sub = {
      id: 1,
      plan_name: 'start',
      max_users: 5,
      max_halls: 2,
      max_products: 50,
      current_period_end: new Date(Date.now() + 86400000).toISOString(),
      plan_features: { workshops: true },
    };
    db.get.mockResolvedValue(sub);
    const { req, res, next } = mockReqRes();
    await checkSubscription(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.plan).toEqual(sub);
  });

  it('passes through if current_period_end is null (unlimited)', async () => {
    const sub = {
      id: 1,
      plan_name: 'pro',
      max_users: 99,
      current_period_end: null,
    };
    db.get.mockResolvedValue(sub);
    const { req, res, next } = mockReqRes();
    await checkSubscription(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('checkLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next if no plan', async () => {
    const { req, res, next } = mockReqRes({ plan: null });
    await checkLimit('users')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next if limit not set (null)', async () => {
    const { req, res, next } = mockReqRes({ plan: { max_users: null } });
    await checkLimit('users')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when limit reached', async () => {
    db.get.mockResolvedValue({ count: 5 });
    const { req, res, next } = mockReqRes({ plan: { max_users: 5 } });
    await checkLimit('users')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ limit: 5, current: 5 }));
  });

  it('calls next when under limit', async () => {
    db.get.mockResolvedValue({ count: 2 });
    const { req, res, next } = mockReqRes({ plan: { max_users: 5 } });
    await checkLimit('users')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next for unknown resource', async () => {
    const { req, res, next } = mockReqRes({ plan: { max_users: 5 } });
    await checkLimit('unknown')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
