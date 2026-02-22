# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HookahPOS — multi-tenant SaaS POS system for hookah bars. Russian-language UI and error messages throughout.

## Commands

```bash
# Development (starts both server and client concurrently)
npm run dev

# Server only (port 3001, uses nodemon)
cd server && npm run dev

# Client only (port 5173, Vite dev server)
cd client && npm run dev

# Install all dependencies (root + server + client)
npm run install:all

# Run database migrations
cd server && npm run migrate

# Build client for production
cd client && npm run build

# Hash a password (utility)
cd server && npm run hash-password
```

No test framework is configured. No linter is configured.

## Architecture

### Server (Express + PostgreSQL)

- **Entry**: `server/index.js` — mounts all `/api/*` routes, rate limiting, serves React build in production
- **DB**: `server/db.js` — pg Pool with helpers: `run(sql, params)`, `all()`, `get()`, `transaction(callback)`. All queries use PG numbered params (`$1, $2`). Money fields are `NUMERIC(12,2)` — use `parseFloat()` when reading
- **Config**: `server/config.js` — reads from `.env`: PORT, DATABASE_URL, JWT_SECRET, CORS_ORIGIN, NODE_ENV
- **Migrations**: `server/migrations/run.js` — runs all migration files sequentially (001–004). Each exports `up()`. Idempotent (uses `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)

### Middleware chain (typical route)

`authMiddleware` → `tenantMiddleware` → `checkSubscription` → `checkLimit(resource)` → route handler

- `auth.js`: JWT verify → loads user → sets `req.user` and `req.tenantId`. Role guards: `adminOnly`, `ownerOnly`, `superadminOnly`
- `tenant.js`: rejects if `req.tenantId` missing
- `subscription.js`: `checkSubscription` (402 if expired), `checkLimit('users'|'halls'|'products')` (403 if over plan limit)

### Multi-tenancy

Row-level isolation via `tenant_id` on all business tables. Every query must filter by `req.tenantId`. Superadmin can impersonate tenants via special JWT payload (`superadmin_impersonating + tenant_id`).

### Roles

`superadmin` (platform-wide) → `owner` (tenant creator) → `admin` → `cashier`

### Client (React 19 + Vite)

- **State**: Zustand stores in `client/src/store/` — `authStore.js` (auth, tenant, branding), `posStore.js` (POS state)
- **API**: `client/src/api.js` — wrapper around fetch, auto-attaches JWT from localStorage, all calls go to `/api/*` (proxied to :3001 in dev)
- **Routing**: `client/src/App.jsx` — react-router-dom v7, route guards: `ProtectedRoute`, `AdminRoute`, `CashierAllowedRoute`. `LayoutSwitch` picks between `Layout` (normal) and `SuperadminLayout`
- **Branding**: `client/src/utils/branding.js` — applies tenant's `accent_color` via CSS custom properties (`--accent`, `--accent-hover`)
- **Styling**: Dark theme via CSS custom properties in `client/src/index.css`, no CSS framework

### Deploy

Docker multi-stage build (Dockerfile): client build → server with static files. docker-compose: `db` (postgres:16), `app` (node), `nginx` (reverse proxy). See `DEPLOY.md` for details.
