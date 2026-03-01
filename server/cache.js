const { LRUCache } = require('lru-cache');

// Tenant by slug — subdomain middleware (every request)
const tenantBySlug = new LRUCache({ max: 500, ttl: 30 * 1000 });

// User by id — auth middleware (every authenticated request)
const userById = new LRUCache({ max: 20000, ttl: 60 * 1000 });

// Subscription + plan by tenant — checkSubscription middleware
const subscriptionByTenant = new LRUCache({ max: 500, ttl: 30 * 1000 });

// Integrations by tenant — loadIntegrations middleware
const integrationByTenant = new LRUCache({ max: 500, ttl: 60 * 1000 });

// Resource counts for checkLimit (key: `${tenantId}:${resource}`)
const resourceCount = new LRUCache({ max: 2000, ttl: 10 * 1000 });

// --- Invalidation helpers ---

function invalidateTenant(slug) {
  if (slug) tenantBySlug.delete(slug);
}

function invalidateUser(id) {
  if (id) userById.delete(id);
}

function invalidateSubscription(tenantId) {
  if (tenantId) subscriptionByTenant.delete(tenantId);
}

function invalidateIntegration(tenantId) {
  if (tenantId) integrationByTenant.delete(tenantId);
}

function invalidateResourceCount(tenantId, resource) {
  if (tenantId && resource) {
    resourceCount.delete(`${tenantId}:${resource}`);
  }
}

module.exports = {
  tenantBySlug,
  userById,
  subscriptionByTenant,
  integrationByTenant,
  resourceCount,
  invalidateTenant,
  invalidateUser,
  invalidateSubscription,
  invalidateIntegration,
  invalidateResourceCount,
};
