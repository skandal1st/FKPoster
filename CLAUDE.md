# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HookahPOS — multi-tenant SaaS POS system designed specifically for hookah bars/lounges. Russian-language UI and error messages throughout. Cloud-based with per-tenant subdomain isolation.

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

- **Entry**: `server/index.js` — mounts all `/api/*` routes, subdomain middleware, CORS, rate limiting, serves React build in production
- **DB**: `server/db.js` — pg Pool with helpers: `run(sql, params)`, `all()`, `get()`, `transaction(callback)`. All queries use PG numbered params (`$1, $2`). Money fields are `NUMERIC(12,2)` — use `parseFloat()` when reading
- **Config**: `server/config.js` — reads from `.env`: PORT, DATABASE_URL, JWT_SECRET, CORS_ORIGIN, NODE_ENV, BASE_DOMAIN
- **Migrations**: `server/migrations/run.js` — runs all migration files sequentially (001–011). Each exports `up()`. Idempotent (uses `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)

### Middleware chain (typical route)

`subdomainMiddleware` (global) → `authMiddleware` → `tenantMiddleware` → `checkSubscription` → `checkLimit(resource)` → route handler

- `subdomain.js`: Parses `Host`/`X-Forwarded-Host` header, extracts slug from `{slug}.{BASE_DOMAIN}`, looks up tenant in DB. Sets `req.subdomainTenant` (tenant object or null) and `req.isMainDomain` (boolean). Mounted globally before all routes
- `auth.js`: JWT verify → loads user → sets `req.user` and `req.tenantId`. Role guards: `adminOnly`, `ownerOnly`, `superadminOnly`
- `tenant.js`: rejects if `req.tenantId` missing
- `subscription.js`: `checkSubscription` (402 if expired), `checkLimit('users'|'halls'|'products')` (403 if over plan limit), `checkFeature(feature)` (403 if plan lacks feature)

### Multi-tenancy

Row-level isolation via `tenant_id` on all business tables. Every query must filter by `req.tenantId`. Superadmin can impersonate tenants via special JWT payload (`superadmin_impersonating + tenant_id`).

### Subdomain system

Each tenant has a unique `slug` (auto-transliterated from company name via `server/utils/slugify.js`). Tenants are accessed at `{slug}.{BASE_DOMAIN}` (e.g., `my-bar.lvh.me` in dev, `my-bar.hookahpos.ru` in prod).

- **Main domain** (`lvh.me`, `hookahpos.ru`): registration of new companies, superadmin panel, owner email/password login (redirects to subdomain after login)
- **Subdomain** (`{slug}.lvh.me`): PIN-code login for employees (cashier-friendly), fallback email/password login for owner, all POS functionality

Dev uses `lvh.me` which resolves to 127.0.0.1 and supports subdomains natively.

### Authentication flows

1. **Email/password** — standard login via `POST /api/auth/login`. On main domain, owner is redirected to their subdomain with `?token=` param
2. **PIN login** (subdomain only) — employee selects their name from `GET /api/auth/employees` list, enters 4-digit PIN on numpad, auto-submits via `POST /api/auth/pin-login`. PIN hashed with bcrypt, uniqueness enforced per tenant
3. **Registration** — `POST /api/auth/register` creates tenant with transliterated slug via `generateUniqueSlug()`, shows subdomain URL for redirect

### Roles

`superadmin` (platform-wide) → `owner` (tenant creator) → `admin` → `cashier`

## Data Model

### Core tables (all business tables have `tenant_id` FK)

- **tenants** — `id`, `company_name`, `slug` (unique, for subdomain), `accent_color`, `plan_id`, `subscription_status`, `subscription_expires_at`, `created_at`
- **plans** — `id`, `name`, `code` (start/business/pro), `price`, `max_users`, `max_halls`, `max_products`, `features` (JSONB — feature flags for `checkFeature()`), `is_active`
- **users** — `id`, `tenant_id`, `name`, `email`, `password_hash`, `pin_hash` (for PIN login), `role` (superadmin/owner/admin/cashier), `is_active`
- **categories** — `id`, `tenant_id`, `name`, `sort_order`, `is_active`
- **products** — `id`, `tenant_id`, `category_id`, `name`, `price`, `cost_price`, `unit`, `min_stock`, `current_stock`, `is_active`
- **halls** — `id`, `tenant_id`, `name`, `is_active`
- **tables** — `id`, `tenant_id`, `hall_id`, `number`, `capacity`, `status` (free/occupied/reserved), `position_x`, `position_y`
- **shifts** — `id`, `tenant_id`, `user_id` (who opened), `opened_at`, `closed_at`, `opening_cash`, `closing_cash`, `status` (open/closed)
- **orders** — `id`, `tenant_id`, `shift_id`, `table_id`, `user_id` (cashier), `hookah_master_id`, `order_number`, `status` (open/paid/cancelled), `subtotal`, `discount_type` (percent/fixed), `discount_value`, `total`, `payment_method` (cash/card/mixed), `paid_cash`, `paid_card`, `created_at`, `closed_at`
- **order_items** — `id`, `order_id`, `product_id`, `product_name` (denormalized), `quantity`, `price`, `total`

### Relations

```
tenants → plans (many-to-one)
tenants → users, categories, products, halls, shifts, orders (one-to-many)
halls → tables (one-to-many)
categories → products (one-to-many)
shifts → orders (one-to-many)
orders → order_items (one-to-many)
orders → tables, users (many-to-one)
```

## API Routes

### Auth (`server/routes/auth.js`)
- `POST /api/auth/register` — register new tenant + owner user
- `POST /api/auth/login` — email/password login
- `POST /api/auth/pin-login` — PIN login (subdomain only)
- `GET /api/auth/employees` — list employees for PIN login screen (subdomain only, public)
- `GET /api/auth/me` — current user + tenant info

### Products (`server/routes/products.js`)
- `GET /api/products` — list all (with category filter)
- `POST /api/products` — create (admin+)
- `PUT /api/products/:id` — update (admin+)
- `DELETE /api/products/:id` — soft delete (admin+)

### Categories (`server/routes/categories.js`)
- `GET /api/categories` — list all
- `POST /api/categories` — create (admin+)
- `PUT /api/categories/:id` — update (admin+)
- `DELETE /api/categories/:id` — delete (admin+)

### Orders (`server/routes/orders.js`)
- `GET /api/orders` — list with filters (date, status, shift)
- `POST /api/orders` — create new order
- `GET /api/orders/:id` — order detail with items
- `PUT /api/orders/:id` — update (add items, change discount)
- `POST /api/orders/:id/pay` — close order with payment
- `POST /api/orders/:id/cancel` — cancel order

### Halls & Tables (`server/routes/halls.js`)
- `GET /api/halls` — list halls with tables
- `POST /api/halls` — create hall (admin+)
- `PUT /api/halls/:id` — update hall (admin+)
- `POST /api/halls/:hallId/tables` — add table
- `PUT /api/halls/:hallId/tables/:id` — update table (position, status)
- `DELETE /api/halls/:hallId/tables/:id` — remove table

### Shifts (`server/routes/shifts.js`)
- `GET /api/shifts` — list shifts (current + history)
- `POST /api/shifts/open` — open shift with opening cash amount
- `POST /api/shifts/close` — close shift, generates summary
- `GET /api/shifts/:id/summary` — shift report (totals, payment breakdown)

### Users / Employees (`server/routes/users.js`)
- `GET /api/users` — list tenant users (admin+)
- `POST /api/users` — create employee with name + PIN (admin+)
- `PUT /api/users/:id` — update (admin+)
- `DELETE /api/users/:id` — deactivate (admin+)

### Reports (`server/routes/reports.js`)
- `GET /api/reports/sales` — sales by date range
- `GET /api/reports/products` — top products ranking
- `GET /api/reports/employees` — employee performance
- `GET /api/reports/summary` — dashboard stats (today's revenue, avg check, order count)

### Tenant Settings (`server/routes/settings.js`)
- `GET /api/settings` — tenant settings (branding, company info)
- `PUT /api/settings` — update settings (owner+)
- `PUT /api/settings/branding` — update accent color (owner+)

### Superadmin (`server/routes/superadmin.js`)
- `GET /api/superadmin/tenants` — all tenants with stats
- `GET /api/superadmin/tenants/:id` — tenant detail
- `POST /api/superadmin/tenants/:id/impersonate` — generate impersonation token
- `GET /api/superadmin/stats` — platform-wide stats (MRR, tenant count, etc.)
- `GET /api/superadmin/plans` — list plans
- `PUT /api/superadmin/plans/:id` — update plan limits/pricing

## Migrations

| # | File | Description |
|---|------|-------------|
| 001 | Initial schema | tenants, users, plans tables. Superadmin user seed |
| 002 | Products & categories | categories, products tables with tenant_id |
| 003 | Halls & tables | halls, tables with position fields for floor plan |
| 004 | Orders | orders, order_items, payment fields |
| 005 | Shifts | shifts table, link orders to shifts |
| 006 | Subscription system | plan limits, subscription status/expiry on tenants, features JSONB |
| 007 | PIN authentication | pin_hash on users, unique constraint logic |
| 008 | Subdomain system | slug on tenants, slugify util, unique index |
| 009 | Branding | accent_color on tenants, company settings fields |
| 010 | Reports | Indexes for report queries (date ranges, aggregations) |
| 011 | Stock management | current_stock, min_stock on products, stock movement log |

## Client (React 19 + Vite)

- **State**: Zustand stores in `client/src/store/` — `authStore.js` (auth, tenant, branding, pinLogin), `posStore.js` (POS state)
- **API**: `client/src/api.js` — wrapper around fetch, auto-attaches JWT from localStorage, all calls go to `/api/*` (proxied to :3001 in dev)
- **Routing**: `client/src/App.jsx` — react-router-dom v7. `isSubdomain()` switches between `SubdomainApp` (PinLogin + POS routes) and `MainDomainApp` (Login, Register, Superadmin). Route guards: `ProtectedRoute`, `AdminRoute`, `CashierAllowedRoute`. `LayoutSwitch` picks between `Layout` (normal) and `SuperadminLayout`
- **Subdomain utils**: `client/src/utils/subdomain.js` — `getTenantSlug()`, `isSubdomain()`, `buildSubdomainUrl(slug)`. Uses `VITE_BASE_DOMAIN` env var
- **Branding**: `client/src/utils/branding.js` — applies tenant's `accent_color` via CSS custom properties (`--accent`, `--accent-hover`)
- **Styling**: Dark theme via CSS custom properties in `client/src/index.css`, no CSS framework

### Client page structure

```
MainDomainApp (hookahpos.ru):
  /login         — owner email/password login → redirect to subdomain
  /register      — new tenant registration
  /superadmin/*  — SuperadminLayout with tenant management

SubdomainApp ({slug}.hookahpos.ru):
  /              — PinLogin (employee list + numpad)
  /pos           — POS cashier screen (main work screen)
  /dashboard     — admin dashboard with stats
  /products      — product management (CRUD)
  /categories    — category management
  /halls         — hall/table management with floor plan
  /shifts        — shift open/close and history
  /reports       — sales and analytics reports
  /employees     — employee management (name + PIN)
  /settings      — tenant settings and branding
```

## Environment variables

Server (`server/.env`): PORT, NODE_ENV, DATABASE_URL, JWT_SECRET, CORS_ORIGIN, BASE_DOMAIN

Client (`client/.env`): VITE_BASE_DOMAIN (must match server's BASE_DOMAIN)

Both default to `lvh.me` for development.

## Deploy

Docker multi-stage build (Dockerfile): client build → server with static files. docker-compose: `db` (postgres:16), `app` (node), `nginx` (reverse proxy with wildcard subdomain support). See `DEPLOY.md` for details.

## Key patterns

- All user-facing strings in Russian
- Employee creation: by name + 4-digit PIN (not email/password). Auto-generated email/password for DB constraints
- PIN uniqueness checked via bcrypt compare against all tenant's PIN hashes
- Vite proxy forwards `X-Forwarded-Host` header so server subdomain middleware works in dev
- CORS dynamically allows any origin containing `BASE_DOMAIN`, `localhost`, or `127.0.0.1`
- Rate limiting: 500 req/15min general API, 20 req/15min for login/register/pin-login
- Money: stored as `NUMERIC(12,2)`, always `parseFloat()` on read, format as `1 234 ₽` in UI
- Dates: stored as `TIMESTAMPTZ`, displayed in Russian format (`22 февраля 2026`)
- Soft deletes: products and users use `is_active` flag, not actual DELETE

## Known limitations & TODO

### Not implemented yet
- **Kitchen module** — recipe cards (техкарты), ingredient tracking, cost calculation, food waste logging. Needed for hookah bars with food menus
- **Loyalty program** — customer database, bonus points, discount cards
- **EGAIS integration** — required for legal alcohol sales in Russia (mandatory for bars serving alcohol)
- **Online booking** — table reservation from external widget/website
- **Mobile app** — currently web-only, native app could improve cashier experience
- **Notifications** — no push/email notifications for low stock, shift reminders, subscription expiry
- **Receipt printing** — no fiscal printer integration (required for legal operation in Russia)
- **Export** — no data export to Excel/CSV or 1C integration
- **Backups** — no automated database backup strategy

### Known technical debt
- No test framework — critical paths (payments, subscriptions, PIN auth) should have tests
- No linter — code style not enforced
- CORS uses substring match (`contains(BASE_DOMAIN)`) — should use exact suffix match for security
- Rate limiting may be too aggressive for POS use (500 req/15min during rush hour)
- No request logging / audit trail for financial operations
- No WebSocket — POS screen doesn't auto-refresh when orders change from another terminal
- Stock movements not fully implemented — only basic current_stock tracking
