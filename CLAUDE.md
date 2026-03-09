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

# Tests (Vitest + Supertest for server, Vitest + jsdom for client)
npm test                    # run all tests (server + client)
npm run test:server         # server only
npm run test:client         # client only
npm run test:watch          # server in watch mode
npm run test:coverage       # with coverage

# Linting & formatting (ESLint 9 flat config + Prettier)
npm run lint                # check lint
npm run lint:fix            # auto-fix lint
npm run format              # format with Prettier
npm run format:check        # check formatting
```

## Architecture

### Server (Express + PostgreSQL)

- **Entry**: `server/index.js` — mounts all `/api/*` routes, subdomain middleware, CORS, rate limiting, socket.io setup, serves React build in production
- **DB**: `server/db.js` — pg Pool with helpers: `run(sql, params)`, `all()`, `get()`, `transaction(callback)`. All queries use PG numbered params (`$1, $2`). Money fields are `NUMERIC(12,2)` — use `parseFloat()` when reading
- **Config**: `server/config.js` — reads from `.env`: PORT, DATABASE_URL, JWT_SECRET, CORS_ORIGIN, NODE_ENV, BASE_DOMAIN
- **Migrations**: `server/migrations/run.js` — runs all migration files sequentially (001–021). Each exports `up()`. Idempotent (uses `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)
- **Services**: `server/services/` — external integration services:
  - `egais/` — UTM client, XML parser/builder for EGAIS protocol
  - `chestniyZnak/` — API client, DataMatrix barcode processing
  - `edo/` — document builder, provider factory with SBIS and Diadoc providers

### Middleware chain (typical route)

`subdomainMiddleware` (global) → `authMiddleware` → `tenantMiddleware` → `checkSubscription` → `checkLimit(resource)` → route handler

- `subdomain.js`: Parses `Host`/`X-Forwarded-Host` header, extracts slug from `{slug}.{BASE_DOMAIN}`, looks up tenant in DB. Sets `req.subdomainTenant` (tenant object or null) and `req.isMainDomain` (boolean). Mounted globally before all routes
- `auth.js`: JWT verify → loads user (with cache) → sets `req.user`, `req.tenantId`, `req.chainId`. Role guards: `adminOnly`, `ownerOnly`, `superadminOnly`, `chainOwnerOnly`
- `tenant.js`: rejects if `req.tenantId` missing
- `subscription.js`: `checkSubscription` (402 if expired), `checkLimit('users'|'halls'|'products')` (403 if over plan limit), `checkFeature(feature)` (403 if plan lacks feature)
- `integration.js`: `loadIntegrations` — loads tenant's integration settings (ЕГАИС, Честный знак, ЭДО) from `tenant_integrations` with cache. Guards: `requireEgais`, `requireChestniyZnak`, `requireEdo`

### Multi-tenancy

Row-level isolation via `tenant_id` on all business tables. Every query must filter by `req.tenantId`. Superadmin can impersonate tenants via special JWT payload (`superadmin_impersonating + tenant_id`). Chain owner can impersonate chain tenants via `chain_impersonating + tenant_id + chain_id`.

### Subdomain system

Each tenant has a unique `slug` (auto-transliterated from company name via `server/utils/slugify.js`). Tenants are accessed at `{slug}.{BASE_DOMAIN}` (e.g., `my-bar.lvh.me` in dev, `my-bar.hookahpos.ru` in prod).

- **Main domain** (`lvh.me`, `hookahpos.ru`): landing page, registration of new companies, superadmin panel, chain management, owner email/password login (redirects to subdomain after login)
- **Subdomain** (`{slug}.lvh.me`): PIN-code login for employees (cashier-friendly), fallback email/password login for owner, all POS functionality

Dev uses `lvh.me` which resolves to 127.0.0.1 and supports subdomains natively.

### Authentication flows

1. **Email/password** — standard login via `POST /api/auth/login`. On main domain, owner is redirected to their subdomain with `?token=` param
2. **PIN login** (subdomain only) — employee selects their name from `GET /api/auth/employees` list, enters 4-digit PIN on numpad, auto-submits via `POST /api/auth/pin-login`. PIN hashed with bcrypt, uniqueness enforced per tenant
3. **Registration** — `POST /api/auth/register` creates tenant with transliterated slug via `generateUniqueSlug()`, shows subdomain URL for redirect
4. **Chain invite** — `GET /accept-invite?token=` — accept invitation to join a chain

### Roles

`superadmin` (platform-wide) → `chain_owner` (multi-tenant chain) → `owner` (tenant creator) → `admin` → `cashier`

### WebSocket (socket.io)

- **Server**: `server/socket.js` — JWT auth on handshake (with user cache), rooms by `tenant:{tenantId}`. Optional Redis adapter for clustered mode (PM2)
- **Event helper**: `server/utils/emitEvent.js` — `emitEvent(req, event, data)` called in route handlers after DB writes
- **Client**: `client/src/store/socketStore.js` — Zustand store, connect/disconnect with auth token
- **Events**: `order:created`, `order:updated`, `order:closed`, `order:cancelled`, `register:opened`, `register:closed`
- **Vite proxy**: `/socket.io` → `localhost:3001` with `ws: true`

## Data Model

### Core tables (all business tables have `tenant_id` FK)

- **tenants** — `id`, `company_name`, `slug` (unique, for subdomain), `accent_color`, `city`, `inn`, `kpp`, `ogrn`, `legal_address`, `actual_address`, `plan_id`, `subscription_status`, `subscription_expires_at`, `day_end_hour`, `created_at`
- **plans** — `id`, `name`, `code` (start/business/pro), `price`, `max_users`, `max_halls`, `max_products`, `max_orders_monthly`, `features` (JSONB — feature flags for `checkFeature()`), `is_active`
- **users** — `id`, `tenant_id`, `name`, `email`, `phone`, `password_hash`, `pin_hash` (for PIN login), `role` (superadmin/chain_owner/owner/admin/cashier), `chain_id`, `active`
- **categories** — `id`, `tenant_id`, `name`, `sort_order`, `is_active`
- **products** — `id`, `tenant_id`, `category_id`, `name`, `price`, `cost_price`, `unit`, `min_stock`, `current_stock`, `is_ingredient`, `barcode`, `marking_type`, `egais_alcocode`, `is_active`
- **ingredient_groups** — `id`, `tenant_id`, `name`, `sort_order`
- **workshops** — `id`, `tenant_id`, `name`, `sort_order`
- **halls** — `id`, `tenant_id`, `name`, `grid_cols`, `grid_rows`, `is_active`
- **tables** — `id`, `tenant_id`, `hall_id`, `number`, `label`, `capacity`, `status` (free/occupied/reserved), `position_x`, `position_y`, `grid_x`, `grid_y`
- **shifts** — `id`, `tenant_id`, `user_id` (who opened), `opened_at`, `closed_at`, `opening_cash`, `closing_cash`, `status` (open/closed)
- **orders** — `id`, `tenant_id`, `shift_id`, `table_id`, `user_id` (cashier), `hookah_master_id`, `guest_id`, `order_number`, `status` (open/paid/cancelled), `subtotal`, `discount_type` (percent/fixed), `discount_value`, `discount_amount`, `total`, `payment_method` (cash/card/mixed), `paid_cash`, `paid_card`, `created_at`, `closed_at`
- **order_items** — `id`, `order_id`, `product_id`, `product_name` (denormalized), `quantity`, `price`, `total`
- **guests** — `id`, `tenant_id`, `name`, `phone`, `discount_type`, `discount_value`, `bonus_balance`, `total_spent`, `visits_count`
- **tenant_integrations** — `id`, `tenant_id`, `egais_enabled`, `egais_fsrar_id`, `chestniy_znak_enabled`, `edo_enabled`, `edo_provider`
- **marked_items** — `id`, `tenant_id`, `product_id`, `marking_code`, `status`
- **egais_documents** — `id`, `tenant_id`, `type`, `status`, `xml_content`, `reply_xml`
- **egais_stock** — `id`, `tenant_id`, `alcocode`, `quantity`, `last_sync`
- **chestniy_znak_operations** — `id`, `tenant_id`, `operation_type`, `marking_code`, `status`
- **counterparties** — `id`, `tenant_id`, `name`, `inn`, `kpp`, `address`
- **edo_documents** — `id`, `tenant_id`, `counterparty_id`, `type`, `status`, `provider`, `external_id`
- **chains** — `id`, `name`, `owner_id`, `created_at`
- **chain_tenants** — `chain_id`, `tenant_id`, `joined_at`
- **chain_transfers** — `id`, `chain_id`, `from_tenant_id`, `to_tenant_id`, `status`, `created_at`
- **chain_transfer_items** — `id`, `transfer_id`, `product_id`, `quantity`
- **salary_settings** — `id`, `tenant_id`, `role`, `rate_type`, `rate_value`
- **salary_workshop_rates** — `id`, `setting_id`, `workshop_id`, `rate_value`
- **work_schedule** — `id`, `tenant_id`, `user_id`, `date`, `hours`, `shift_id`
- **salary_payouts** — `id`, `tenant_id`, `user_id`, `period_start`, `period_end`, `amount`, `status`
- **tenant_print_settings** — `id`, `tenant_id`, `header_text`, `footer_text`, `show_logo`, `paper_width`

### Relations

```
tenants → plans (many-to-one)
tenants → users, categories, products, halls, shifts, orders, guests (one-to-many)
tenants → tenant_integrations (one-to-one)
halls → tables (one-to-many)
categories → products (one-to-many)
categories → workshops (many-to-one via workshop_id)
products → ingredient_groups (many-to-one via ingredient_group_id)
shifts → orders (one-to-many)
orders → order_items (one-to-many)
orders → tables, users, guests (many-to-one)
chains → chain_tenants → tenants (many-to-many)
chains → chain_transfers → chain_transfer_items (one-to-many)
users → work_schedule, salary_payouts (one-to-many)
counterparties → edo_documents (one-to-many)
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

### Ingredients (`server/routes/ingredients.js`)
- CRUD for products with `is_ingredient = true`

### Ingredient Groups (`server/routes/ingredientGroups.js`)
- CRUD for ingredient groups (admin+)

### Workshops (`server/routes/workshops.js`)
- CRUD for workshops / цеха (admin+)

### Orders (`server/routes/orders.js`)
- `GET /api/orders` — list with filters (date, status, shift)
- `POST /api/orders` — create new order
- `GET /api/orders/:id` — order detail with items
- `PUT /api/orders/:id` — update (add items, change discount)
- `POST /api/orders/:id/pay` — close order with payment (cash/card/mixed split)
- `POST /api/orders/:id/cancel` — cancel order

### Halls & Tables (`server/routes/halls.js`, `server/routes/tables.js`)
- `GET /api/halls` — list halls with tables
- `POST /api/halls` — create hall (admin+)
- `PUT /api/halls/:id` — update hall (admin+)
- `POST /api/halls/:hallId/tables` — add table
- `PUT /api/halls/:hallId/tables/:id` — update table (position, status)
- `DELETE /api/halls/:hallId/tables/:id` — remove table

### Shifts / Register (`server/routes/register.js`)
- Open/close register day (cash shift), generate summary

### Users / Employees (`server/routes/users.js`)
- `GET /api/users` — list tenant users (admin+)
- `POST /api/users` — create employee with name + PIN (admin+)
- `PUT /api/users/:id` — update (admin+)
- `DELETE /api/users/:id` — deactivate (admin+)

### Stats / Reports (`server/routes/stats.js`)
- Sales, products, employees, cost, traffic, discounts reports by date range
- Dashboard summary stats

### Supplies (`server/routes/supplies.js`)
- CRUD for supply deliveries (admin+)

### Inventories (`server/routes/inventories.js`)
- Inventory checks / stock reconciliation (admin+)

### Guests / Loyalty (`server/routes/guests.js`)
- CRUD for guest profiles with discount/bonus settings
- Bonus accrual and spending on orders

### Integrations (`server/routes/integrations.js`)
- `GET/PUT /api/integrations` — tenant integration settings (ЕГАИС, Честный знак, ЭДО)

### EGAIS (`server/routes/egais.js`)
- EGAIS document management, stock sync

### Marking (`server/routes/marking.js`)
- Marked items (ЕГАИС/Честный знак barcode tracking)

### EDO (`server/routes/edo.js`)
- Electronic document exchange (СБИС, Диадок providers)

### Counterparties (`server/routes/counterparties.js`)
- CRUD for counterparties (suppliers, partners)

### Chain Management (`server/routes/chain.js`)
- Chain dashboard, tenants list, sales/comparison/products analytics
- Chain transfers between tenants
- Invite tenants, impersonate chain tenants

### Schedule (`server/routes/schedule.js`)
- Employee work schedule management

### Salary (`server/routes/salary.js`)
- Salary settings, rates, payouts, calculations

### Tenant Settings (`server/routes/tenants.js`, `server/routes/settings` via tenants)
- `GET/PUT /api/tenant` — tenant settings (branding, company info, legal fields)

### Subscriptions (`server/routes/subscriptions.js`)
- Subscription status, plan changes

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
| 001 | Initial schema | users, halls, tables, categories, products, supplies, orders, inventories |
| 002 | Multi-tenant | tenants, plans, subscriptions, tenant_id on all tables |
| 003 | Add ingredients | `is_ingredient` on products |
| 004 | Superadmin | superadmin role |
| 005 | Marking & EGAIS | tenant_integrations, marked_items, egais_documents, egais_stock, chestniy_znak_operations |
| 006 | Guests & loyalty | guests table, guest_id/discount_amount on orders |
| 007 | Ingredient groups | ingredient_groups table, ingredient_group_id on products |
| 008 | Workshops | workshops table, workshop_id on categories |
| 009 | Hall grid | grid_cols/grid_rows on halls, grid_x/grid_y on tables |
| 010 | Plans dedupe | Plan deduplication, UNIQUE(name) |
| 011 | Subdomain & PIN auth | pin_hash on users, slug cleanup |
| 012 | Print settings | tenant_print_settings table |
| 013 | Table labels | label column on tables |
| 014 | Chains | chains, chain_tenants, chain_transfers, chain_transfer_items, chain_owner role |
| 015 | Business plan | "Бизнес" plan with chain_management feature |
| 016 | Mixed payment | paid_cash, paid_card on orders |
| 017 | Performance indexes | Indexes on key tables for query performance |
| 018 | Salary module | salary_settings, salary_workshop_rates, work_schedule, salary_payouts |
| 019 | Free plan limits | max_orders_monthly on plans |
| 020 | Phone & city | phone on users, city on tenants |
| 021 | EDO integration | counterparties, edo_documents, legal fields (inn, kpp, ogrn, etc.) on tenants |

## Client (React 19 + Vite)

- **State**: Zustand stores in `client/src/store/` — `authStore.js` (auth, tenant, branding, pinLogin), `posStore.js` (POS state), `socketStore.js` (WebSocket connection)
- **API**: `client/src/api.js` — wrapper around fetch, auto-attaches JWT from localStorage, all calls go to `/api/*` (proxied to :3001 in dev)
- **Routing**: `client/src/App.jsx` — react-router-dom v7. `isSubdomain()` switches between `SubdomainApp` (PinLogin + POS routes) and `MainDomainApp` (Landing, Login, Register, Superadmin, Chain). Route guards: `ProtectedRoute`, `AdminRoute`, `CashierAllowedRoute`, `FeatureRoute` (checks plan features)
- **Subdomain utils**: `client/src/utils/subdomain.js` — `getTenantSlug()`, `isSubdomain()`, `buildSubdomainUrl(slug)`. Uses `VITE_BASE_DOMAIN` env var
- **Branding**: `client/src/utils/branding.js` — applies tenant's `accent_color` via CSS custom properties (`--accent`, `--accent-hover`)
- **Styling**: Dark theme via CSS custom properties in `client/src/index.css`, no CSS framework

### Client page structure

```
MainDomainApp (hookahpos.ru):
  /                — Landing page (HookahBOSLanding)
  /login           — owner email/password login → redirect to subdomain
  /register        — new tenant registration
  /accept-invite   — accept chain invitation
  /superadmin      — SuperadminTenants (platform management)
  /chain           — ChainDashboard (chain owner view)
  /chain/tenants   — ChainTenants list
  /chain/sales     — ChainSales analytics
  /chain/comparison — ChainComparison between tenants
  /chain/products  — ChainProducts across chain
  /chain/transfers — ChainTransfers between tenants
  /admin/*         — same admin routes as subdomain (for owner on main domain)

SubdomainApp ({slug}.hookahpos.ru):
  /login                    — PinLogin (employee list + numpad)
  /                         — HallMap (read-only for cashier, floor plan view)
  /hall-map                 — HallMap editor (admin+)
  /dashboard                — Dashboard with stats (requires "reports" feature)
  /stats                    — Detailed stats/analytics (admin+, requires "reports" feature)
  /admin/categories         — Category management
  /admin/workshops          — Workshop/цех management
  /admin/products           — Product management (CRUD)
  /admin/ingredients        — Ingredient management
  /admin/ingredient-groups  — Ingredient group management
  /admin/supplies           — Supply deliveries (requires "inventory" feature)
  /admin/register           — Register day (cash shift open/close)
  /admin/users              — Employee management (name + PIN)
  /admin/inventory          — Inventory list (requires "inventory" feature)
  /admin/inventory-check    — Inventory reconciliation (requires "inventory" feature)
  /admin/settings           — Tenant settings and branding
  /admin/integrations       — Integration settings (ЕГАИС, Честный знак, ЭДО)
  /admin/egais              — EGAIS documents
  /admin/marked-items       — Marked items tracking
  /admin/guests             — Guest/loyalty management
  /admin/schedule           — Employee work schedule
  /admin/salary             — Salary management
  /admin/edo                — EDO documents (requires "edo" feature)
  /admin/counterparties     — Counterparty management
  /admin/receiving          — Receiving / приёмка товара
  /chain/transfers          — Chain transfers
```

## Environment variables

Server (`server/.env`): PORT, NODE_ENV, DATABASE_URL, JWT_SECRET, CORS_ORIGIN, BASE_DOMAIN

Client (`client/.env`): VITE_BASE_DOMAIN (must match server's BASE_DOMAIN)

Both default to `lvh.me` for development.

## Deploy

Docker multi-stage build (Dockerfile): client build → server with static files. docker-compose: `db` (postgres:16), `app` (node), `nginx` (reverse proxy with wildcard subdomain support). See `DEPLOY.md` for details.

## Testing & Linting

- **Test framework**: Vitest 4 + Supertest (server), Vitest 4 + jsdom (client)
- **Run**: `npm test` from root, or `npm run test:server` / `npm run test:client`
- **Linting**: ESLint 9 flat config (`eslint.config.mjs`) + Prettier (`.prettierrc`)
- **Scripts**: `npm run lint`, `lint:fix`, `format`, `format:check`

## Key patterns

- All user-facing strings in Russian
- Employee creation: by name + 4-digit PIN (not email/password). Auto-generated email/password for DB constraints
- PIN uniqueness checked via bcrypt compare against all tenant's PIN hashes
- Vite proxy forwards `X-Forwarded-Host` header so server subdomain middleware works in dev
- CORS uses exact suffix match (`endsWith('.' + BASE_DOMAIN)`) for security — parses origin URL hostname
- Rate limiting: 1500 req/15min general API (keyed by host:IP), 20 req/15min for login/register/pin-login
- Money: stored as `NUMERIC(12,2)`, always `parseFloat()` on read, format as `1 234 ₽` in UI
- Dates: stored as `TIMESTAMPTZ`, displayed in Russian format (`22 февраля 2026`)
- Soft deletes: products and users use `is_active`/`active` flag, not actual DELETE
- Mixed payment: orders support cash/card/mixed with `paid_cash` + `paid_card` split
- Feature gating: plan `features` JSONB controls access to modules (inventory, reports, edo, chain_management) via `checkFeature()` middleware and `FeatureRoute` client guard
- User cache: `server/cache.js` provides in-memory LRU caches (`userById`, `integrationByTenant`) for hot-path queries

## Known limitations & TODO

### Not implemented yet
- **Mobile app** — currently web-only, native app could improve cashier experience
- **Notifications** — no push/email notifications for low stock, shift reminders, subscription expiry
- **Receipt printing** — no fiscal printer integration (required for legal operation in Russia)
- **Export** — no data export to Excel/CSV or 1C integration
- **Backups** — no automated database backup strategy
- **Online booking** — no table reservation from external widget/website (work schedule is employee-only)

### Known technical debt
- Rate limiting may be too aggressive for POS use during rush hour
- No audit trail for financial operations (only Morgan request logging)
- Stock movements not fully implemented — only basic current_stock tracking
