/**
 * Test setup: intercepts Node.js require() for CJS modules to enable mocking.
 *
 * Since server code uses CommonJS require(), Vitest's vi.mock() cannot intercept it.
 * We override Module._load to serve mock modules when server code requires db, config, or pg.
 */
import { vi } from 'vitest';
import Module from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');

// Create mock db functions that can be controlled from tests
const mockDb = {
  run: vi.fn(),
  all: vi.fn(),
  get: vi.fn(),
  transaction: vi.fn(),
  getDb: vi.fn(),
  pool: {},
};

const mockConfig = {
  JWT_SECRET: 'test-secret',
  PORT: 3001,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://fake:fake@localhost:5432/fake',
  CORS_ORIGIN: '',
  BASE_DOMAIN: 'lvh.me',
};

const mockPg = {
  Pool: vi.fn(() => ({
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  })),
};

// Save original _load
const originalLoad = Module._load;

// Mock emitEvent (no-op in tests)
const mockEmitEvent = {
  emitEvent: vi.fn(),
};

// Resolve paths to intercept
const dbPath = path.resolve(serverDir, 'db.js');
const configPath = path.resolve(serverDir, 'config.js');
const emitEventPath = path.resolve(serverDir, 'utils', 'emitEvent.js');

Module._load = function (request, parent, ...rest) {
  // Resolve the actual file path for relative requires
  if (parent && parent.filename) {
    try {
      const resolved = Module._resolveFilename(request, parent);
      if (resolved === dbPath) return mockDb;
      if (resolved === configPath) return mockConfig;
      if (resolved === emitEventPath) return mockEmitEvent;
    } catch {
      // Module not found — fall through to original
    }
  }
  // Intercept node_modules
  if (request === 'pg') return mockPg;
  if (request === 'socket.io') return { Server: vi.fn() };

  return originalLoad.call(this, request, parent, ...rest);
};

// Export mocks so tests can import and control them
globalThis.__mocks = { db: mockDb, config: mockConfig, pg: mockPg, emitEvent: mockEmitEvent };
