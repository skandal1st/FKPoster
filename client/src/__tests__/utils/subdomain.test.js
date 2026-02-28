import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock import.meta.env before importing the module
// Vitest handles import.meta.env natively
vi.stubEnv('VITE_BASE_DOMAIN', 'lvh.me');

describe('subdomain utils', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getTenantSlug', () => {
    it('returns slug from subdomain', async () => {
      vi.stubGlobal('window', {
        location: { hostname: 'my-bar.lvh.me', port: '5173', protocol: 'http:' },
      });
      // Re-import to pick up the stubbed window
      const { getTenantSlug } = await import('../../utils/subdomain.js');
      expect(getTenantSlug()).toBe('my-bar');
    });

    it('returns null on main domain', async () => {
      vi.stubGlobal('window', {
        location: { hostname: 'lvh.me', port: '5173', protocol: 'http:' },
      });
      const { getTenantSlug } = await import('../../utils/subdomain.js');
      expect(getTenantSlug()).toBeNull();
    });

    it('returns null for multi-level subdomain', async () => {
      vi.stubGlobal('window', {
        location: { hostname: 'a.b.lvh.me', port: '', protocol: 'https:' },
      });
      const { getTenantSlug } = await import('../../utils/subdomain.js');
      expect(getTenantSlug()).toBeNull();
    });
  });

  describe('isSubdomain', () => {
    it('returns true on subdomain', async () => {
      vi.stubGlobal('window', {
        location: { hostname: 'test.lvh.me', port: '', protocol: 'http:' },
      });
      const { isSubdomain } = await import('../../utils/subdomain.js');
      expect(isSubdomain()).toBe(true);
    });

    it('returns false on main domain', async () => {
      vi.stubGlobal('window', {
        location: { hostname: 'lvh.me', port: '', protocol: 'http:' },
      });
      const { isSubdomain } = await import('../../utils/subdomain.js');
      expect(isSubdomain()).toBe(false);
    });
  });

  describe('buildSubdomainUrl', () => {
    it('builds URL with port', async () => {
      vi.stubGlobal('window', {
        location: { hostname: 'lvh.me', port: '5173', protocol: 'http:' },
      });
      const { buildSubdomainUrl } = await import('../../utils/subdomain.js');
      expect(buildSubdomainUrl('my-bar')).toBe('http://my-bar.lvh.me:5173');
    });

    it('builds URL without port', async () => {
      vi.stubGlobal('window', {
        location: { hostname: 'hookahpos.ru', port: '', protocol: 'https:' },
      });
      const { buildSubdomainUrl } = await import('../../utils/subdomain.js');
      expect(buildSubdomainUrl('cafe')).toBe('https://cafe.lvh.me');
    });
  });
});
