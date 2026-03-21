# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HookahPOS — multi-tenant SaaS POS system for hospitality businesses (hookah bars, cafes, restaurants, fast food). Russian-language UI and error messages throughout. Cloud-based with per-tenant subdomain isolation.

**Multi-business support**: система адаптируется под тип заведения (`business_type`: hookah/cafe/restaurant/fastfood) и режим работы (`pos_mode`: table_service/fast_pos).

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

# Run a single test file
cd server && npx vitest run tests/auth.test.js
cd client && npx vitest run src/components/SomeComponent.test.jsx

# Run tests matching a name pattern
cd server && npx vitest run -t "should login with PIN"

# Linting & formatting (ESLint 9 flat config + Prettier)
npm run lint                # check lint
npm run lint:fix            # auto-fix lint
npm run format              # format with Prettier
npm run format:check        # check formatting

# KKT Bridge (Windows desktop app for physical fiscal printers)
cd kkt-bridge-windows
npm install
npm start                   # development mode
npm run build               # build installer
```

## Architecture

### Server (Express + PostgreSQL)

- **Entry**: `server/index.js` — mounts all `/api/*` routes, subdomain middleware, CORS, rate limiting, socket.io setup, serves React build in production
- **DB**: `server/db.js` — pg Pool with helpers: `run(sql, params)`, `all()`, `get()`, `transaction(callback)`. All queries use PG numbered params (`$1, $2`). Money fields are `NUMERIC(12,2)` — use `parseFloat()` when reading
- **Config**: `server/config.js` — reads from `.env`: PORT, DATABASE_URL, JWT_SECRET, CORS_ORIGIN, NODE_ENV, BASE_DOMAIN, BASE_URL
- **Migrations**: `server/migrations/run.js` — runs all migration files sequentially (001–031). Each exports `up()`. Idempotent (uses `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)
- **Utilities**: `server/utils/referralCommission.js` — `accrueCommissionIfReferred(tenantId, plan)`: начисляет 30% комиссию партнёру при смене/продлении платного плана. Идемпотентна (ловит unique constraint 23505)
- **Services**: `server/services/` — external integration services:
  - `egais/` — UTM client, XML parser/builder for EGAIS protocol
  - `chestniyZnak/` — API client, DataMatrix barcode processing
  - `edo/` — document builder, provider factory with SBIS and Diadoc providers
  - `kkt/` — fiscal receipt service with provider factory (АТОЛ Онлайн, physical KKT bridge)

### Middleware chain (typical route)

`subdomainMiddleware` (global) → `authMiddleware` → `tenantMiddleware` → `checkSubscription` → `checkLimit(resource)` → `loadIntegrations` → route handler

- `subdomain.js`: Parses `Host`/`X-Forwarded-Host` header, extracts slug from `{slug}.{BASE_DOMAIN}`, looks up tenant in DB. Sets `req.subdomainTenant` (tenant object or null) and `req.isMainDomain` (boolean). Mounted globally before all routes
- `auth.js`: JWT verify → loads user (with cache) → sets `req.user`, `req.tenantId`, `req.chainId`. Role guards: `adminOnly`, `ownerOnly`, `superadminOnly`, `chainOwnerOnly`
- `tenant.js`: rejects if `req.tenantId` missing
- `subscription.js`: `checkSubscription` (402 if expired), `checkLimit('users'|'halls'|'products')` (403 if over plan limit), `checkFeature(feature)` (403 if plan lacks feature)
- `integration.js`: `loadIntegrations` — loads tenant's integration settings (ЕГАИС, Честный знак, ЭДО, ККТ) from `tenant_integrations` with cache. Guards: `requireEgais`, `requireChestniyZnak`, `requireEdo`

### Multi-tenancy

Row-level isolation via `tenant_id` on all business tables. Every query must filter by `req.tenantId`. Superadmin can impersonate tenants via special JWT payload (`superadmin_impersonating + tenant_id`). Chain owner can impersonate chain tenants via `chain_impersonating + tenant_id + chain_id`.

### Subdomain system

Each tenant has a unique `slug` (auto-transliterated from company name via `server/utils/slugify.js`). Tenants are accessed at `{slug}.{BASE_DOMAIN}` (e.g., `my-bar.lvh.me` in dev, `my-bar.skandata.ru` in prod).

- **Main domain** (`lvh.me`, `skandata.ru`): landing page, registration of new companies, superadmin panel, chain management, owner email/password login (redirects to subdomain after login)
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

- **Server**: `server/socket.js` — JWT auth on handshake (with user cache), rooms by `tenant:{tenantId}` and `device:{deviceId}` (for KKT bridge). Optional Redis adapter for clustered mode (PM2)
- **Event helper**: `server/utils/emitEvent.js` — `emitEvent(req, event, data)` called in route handlers after DB writes
- **Client**: `client/src/store/socketStore.js` — Zustand store, connect/disconnect with auth token
- **Events**:
  - **Order events**: `order:created`, `order:updated`, `order:closed`, `order:cancelled`
  - **Register events**: `register:opened`, `register:closed`
  - **Fiscal events**: `fiscal:print` (to bridge), `fiscal:confirmed`, `fiscal:error` (from bridge)
- **Vite proxy**: `/socket.io` → `localhost:3001` with `ws: true`
- **Device auth**: Bridge clients connect with device JWT (`{ device_id, tenant_id }`), join `device:{deviceId}` room for targeted notifications

## Data Model

### Core tables (all business tables have `tenant_id` FK)

- **tenants** — `id`, `company_name`, `slug` (unique, for subdomain), `business_type` (hookah/cafe/restaurant/fastfood), `pos_mode` (table_service/fast_pos), `theme` (dark/light), `accent_color`, `city`, `inn`, `kpp`, `ogrn`, `legal_address`, `actual_address`, `plan_id`, `subscription_status`, `subscription_expires_at`, `day_end_hour`, `show_table_timer`, `table_timer_mode` (VARCHAR 10, auto/off), `referred_by_code` (VARCHAR 20), `created_at`
- **plans** — `id`, `name`, `code` (VARCHAR 50 UNIQUE: free/start/business/chains), `price`, `yearly_price` (NUMERIC 10,2), `max_users`, `max_halls`, `max_products`, `max_orders_monthly`, `max_integrations` (INTEGER), `features` (JSONB — feature flags for `checkFeature()`), `is_active`
- **users** — `id`, `tenant_id`, `name`, `email`, `phone`, `password_hash`, `pin_hash` (for PIN login), `role` (superadmin/chain_owner/owner/admin/cashier), `chain_id`, `active`
- **categories** — `id`, `tenant_id`, `name`, `workshop_id`, `sort_order`, `is_active`
- **products** — `id`, `tenant_id`, `category_id`, `name`, `price`, `cost_price`, `unit`, `min_stock`, `quantity`, `track_inventory`, `is_ingredient`, `is_composite`, `barcode`, `image_url`, `marking_type`, `egais_alcocode`, `vat_rate`, `active`
- **product_variants** — `id`, `product_id`, `name`, `price`, `cost_price`, `barcode`, `is_active` (e.g., drink sizes: 0.2л, 0.4л)
- **modifiers** — `id`, `tenant_id`, `name`, `price`, `cost_price`, `ingredient_id`, `active` (e.g., toppings, syrups, extras)
- **product_modifiers** — `product_id`, `modifier_id` (M:N relationship)
- **order_item_modifiers** — `id`, `order_item_id`, `modifier_id`, `modifier_name`, `price`, `quantity`
- **ingredient_groups** — `id`, `tenant_id`, `name`, `sort_order`
- **workshops** — `id`, `tenant_id`, `name`, `sort_order` (кухонные цеха для передачи заказов)
- **halls** — `id`, `tenant_id`, `name`, `grid_cols`, `grid_rows`, `is_active`
- **tables** — `id`, `tenant_id`, `hall_id`, `number`, `label`, `capacity`, `status` (free/occupied/reserved), `position_x`, `position_y`, `grid_x`, `grid_y`
- **register_days** — `id`, `tenant_id`, `user_id` (who opened), `opened_at`, `closed_at`, `opening_cash`, `closing_cash`, `status` (open/closed)
- **orders** — `id`, `tenant_id`, `register_day_id`, `table_id`, `user_id` (cashier), `hookah_master_id`, `guest_id`, `order_number`, `order_type` (dine_in/take_away/delivery), `status` (open/closed/cancelled), `total_before_discount`, `discount_amount`, `total`, `payment_method` (cash/card/mixed/delivery), `paid_cash`, `paid_card`, `fiscal_number`, `fiscal_document_number`, `fiscal_sign`, `idempotency_key`, `timer_started_at` (TIMESTAMPTZ для ручного режима таймера), `created_at`, `closed_at`
- **order_items** — `id`, `order_id`, `product_id`, `variant_id`, `product_name` (denormalized), `quantity`, `price`, `cost_price`, `total`, `marking_type`, `marked_codes_required`, `marked_codes_scanned`
- **guests** — `id`, `tenant_id`, `name`, `phone`, `discount_type`, `discount_value`, `bonus_balance`, `total_spent`, `visits_count`, `active`
- **tenant_integrations** — `id`, `tenant_id`, `egais_enabled`, `egais_fsrar_id`, `chestniy_znak_enabled`, `edo_enabled`, `edo_provider`, `kkt_enabled`, `kkt_provider`, `kkt_strict_mode`, `kkt_environment`, `kkt_physical_enabled`, ...
- **kkt_receipts** — `id`, `tenant_id`, `order_id`, `external_uuid`, `receipt_type`, `status`, `fiscal_number`, `fiscal_document`, `fiscal_sign`, `registration_number`, `fn_number`, `total`, `payment_method`, `kkt_provider`, `request_payload`, `response_payload`, `error_message`, `retry_count`, `created_at`, `updated_at`
- **kkt_physical_devices** — `id`, `tenant_id`, `device_id` (unique), `name`, `platform` (android/windows/ios/linux), `status` (online/offline), `atol_model`, `last_seen_at`, `created_at`
- **kkt_pairing_tokens** — `id`, `tenant_id`, `token`, `device_name`, `used`, `expires_at`, `created_at`
- **kkt_physical_queue** — `id`, `tenant_id`, `order_id`, `device_id`, `receipt_type`, `status` (pending/sent/done/error), `receipt_data` (JSONB), `fiscal_number`, `fiscal_document_number`, `fiscal_sign`, `fiscal_datetime`, `error_message`, `retry_count`, `created_at`, `updated_at`
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
- **partners** — `id`, `name`, `email`, `phone`, `password_hash`, `referral_code` (unique 8-char), `user_id`, `balance`, `total_earned`, `total_withdrawn`, `active`, `created_at`
- **referrals** — `id`, `partner_id`, `tenant_id`, `promo_applied`, `created_at` (UNIQUE tenant_id)
- **partner_commissions** — `id`, `partner_id`, `referral_id`, `tenant_id`, `plan_name`, `plan_price`, `commission_rate` (default 0.30), `commission_amount`, `period_start`, `created_at` (UNIQUE referral_id+period_start)
- **partner_payouts** — `id`, `partner_id`, `amount`, `status` (pending/...), `payment_details`, `admin_comment`, `processed_at`, `created_at`

### Relations

```
tenants → plans (many-to-one)
tenants → users, categories, products, halls, orders, guests, modifiers (one-to-many)
tenants → tenant_integrations (one-to-one)
tenants → kkt_physical_devices (one-to-many)
halls → tables (one-to-many)
categories → products (one-to-many)
categories → workshops (many-to-one via workshop_id)
products → ingredient_groups (many-to-one via ingredient_group_id)
products → product_variants, product_modifiers (one-to-many)
products → modifiers (many-to-many via product_modifiers)
register_days → orders (one-to-many)
orders → order_items → order_item_modifiers (one-to-many)
orders → tables, users, guests, product_variants (many-to-one)
orders → kkt_receipts, kkt_physical_queue (one-to-many)
kkt_physical_devices → kkt_physical_queue (one-to-many)
chains → chain_tenants → tenants (many-to-many)
chains → chain_transfers → chain_transfer_items (one-to-many)
users → work_schedule, salary_payouts (one-to-many)
counterparties → edo_documents (one-to-many)
modifiers → products (many-to-many via product_modifiers)
modifiers → products (many-to-one via ingredient_id for inventory tracking)
```

## API Routes

### Auth (`server/routes/auth.js`)
- `POST /api/auth/register` — register new tenant + owner user (accepts optional `referral_code` для привязки тенанта к партнёру)
- `POST /api/auth/login` — email/password login
- `POST /api/auth/pin-login` — PIN login (subdomain only)
- `GET /api/auth/employees` — list employees for PIN login screen (subdomain only, public)
- `GET /api/auth/me` — current user + tenant info

### Products (`server/routes/products.js`)
- `GET /api/products` — list all (with category filter)
- `POST /api/products` — create (admin+)
- `PUT /api/products/:id` — update (admin+)
- `DELETE /api/products/:id` — soft delete (admin+)

### Modifiers (`server/routes/modifiers.js`)
- `GET /api/modifiers` — list all modifiers for tenant
- `POST /api/modifiers` — create modifier (admin+)
- `PUT /api/modifiers/:id` — update modifier (admin+)
- `DELETE /api/modifiers/:id` — soft delete modifier (admin+)

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
- `GET /api/orders` — list with filters (date, status, shift, order_type)
- `POST /api/orders` — create new order
- `GET /api/orders/:id` — order detail with items + modifiers
- `PUT /api/orders/:id` — update (add items, change discount)
- `POST /api/orders/:id/items` — add item with modifiers and variants
- `PUT /api/orders/:id/items/:itemId` — update item quantity
- `POST /api/orders/:id/close` — close order with payment (cash/card/mixed split), fiscal integration
- `POST /api/orders/:id/cancel` — cancel order
- `PATCH /api/orders/:id/payment-method` — change payment method

### Halls & Tables (`server/routes/halls.js`, `server/routes/tables.js`)
- `GET /api/halls` — list halls with tables
- `POST /api/halls` — create hall (admin+)
- `PUT /api/halls/:id` — update hall (admin+)
- `POST /api/halls/:hallId/tables` — add table
- `PUT /api/halls/:hallId/tables/:id` — update table (position, status)
- `DELETE /api/halls/:hallId/tables/:id` — remove table

### Register (`server/routes/register.js`)
- `GET /api/register/current` — current open register day
- `POST /api/register/open` — open register day
- `POST /api/register/close` — close register day with Z-report

### Users / Employees (`server/routes/users.js`)
- `GET /api/users` — list tenant users (admin+)
- `POST /api/users` — create employee with name + PIN (admin+)
- `PUT /api/users/:id` — update (admin+)
- `DELETE /api/users/:id` — deactivate (admin+)

### Stats / Reports (`server/routes/stats.js`)
- `GET /api/stats/dashboard` — dashboard summary
- `GET /api/stats/sales` — sales by period
- `GET /api/stats/products` — product popularity
- `GET /api/stats/employees` — employee performance
- `GET /api/stats/order-types` — разбивка заказов по типу (dine_in/take_away/delivery), требует feature 'reports'

### Partner / Referral (`server/routes/partner.js`)
Отдельный JWT (`partner_id` payload), не смешивается с tenant/superadmin токенами.
- `POST /api/partner/register` — регистрация партнёра (name, email, phone, password)
- `POST /api/partner/login` — вход партнёра → token + partner data
- `GET /api/partner/me` — текущий партнёр (partnerAuth middleware)
- `GET /api/partner/stats` — статистика: рефералы, комиссии, баланс
- `GET /api/partner/referrals` — список привлечённых тенантов с деталями комиссий
- `GET /api/partner/commissions` — история начислений (paginated)
- `POST /api/partner/payouts` — запрос выплаты (amount, payment_details)
- `GET /api/partner/payouts` — история выплат
Rate limit: /api/partner/login и /api/partner/register — 20 req/15min

### Supplies (`server/routes/supplies.js`)
- CRUD for supply deliveries (admin+)

### Inventories (`server/routes/inventories.js`)
- Inventory checks / stock reconciliation (admin+)

### Guests / Loyalty (`server/routes/guests.js`)
- CRUD for guest profiles with discount/bonus settings
- Bonus accrual and spending on orders

### Integrations (`server/routes/integrations.js`)
- `GET /api/integrations` — get tenant integration settings
- `PUT /api/integrations` — update integration settings (ЕГАИС, Честный знак, ЭДО, ККТ)

### KKT Cloud (`server/routes/kkt.js`)
- Cloud fiscal integration (АТОЛ Онлайн, etc.)
- Receipt management and status checks

### Fiscal Devices (`server/routes/fiscalDevices.js`)
- **Admin endpoints**:
  - `GET /api/fiscal-devices` — list physical devices
  - `DELETE /api/fiscal-devices/:id` — remove device
  - `POST /api/fiscal-devices/pairing-token` — generate pairing URL for bridge client
  - `GET /api/fiscal-devices/queue` — receipt queue history
  - `POST /api/fiscal-devices/queue` — manually enqueue receipt
- **Public endpoint**:
  - `POST /api/fiscal-devices/pair` — device pairing (rate limited: 10/15min)
- **Device endpoints** (require device JWT):
  - `POST /api/fiscal-devices/heartbeat` — device alive signal
  - `GET /api/fiscal-devices/pending` — pull pending receipts
  - `PATCH /api/fiscal-devices/queue/:id/confirm` — confirm printed receipt
  - `PATCH /api/fiscal-devices/queue/:id/error` — report print error

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

### Upload (`server/routes/upload.js`)
- `POST /api/upload/product-image` — upload product image (multer)

### Tenant Settings (`server/routes/tenants.js`)
- `GET /api/tenant` — get tenant settings
- `PUT /api/tenant` — update tenant settings (branding, business_type, pos_mode, company info, legal fields)

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
| 022 | KKT cloud integration | kkt_receipts table, kkt_* fields on tenant_integrations, vat_rate on products |
| 023 | Table timer & KKT env | show_table_timer on tenants, kkt_environment on tenant_integrations |
| 024 | Order idempotency | idempotency_key on orders |
| 025 | Product modifiers | modifiers, product_modifiers, order_item_modifiers tables |
| 026 | Business types & variants | business_type, pos_mode, theme on tenants; product_variants, image_url on products; order_type on orders |
| 027 | Physical KKT devices | kkt_physical_devices, kkt_pairing_tokens, kkt_physical_queue, kkt_physical_enabled flag |
| 028 | Orders fiscal fields | fiscal_number, fiscal_document_number, fiscal_sign on orders |
| 029 | `029_timer_modes.js` | `table_timer_mode` VARCHAR(10) на tenants ('auto'/'off', default 'auto'); `timer_started_at` TIMESTAMPTZ на orders. Переносит данные из `show_table_timer` |
| 030 | `030_referral_program.js` | Партнёрская программа: таблицы `partners`, `referrals`, `partner_commissions`, `partner_payouts`; колонка `referred_by_code` на tenants |
| 031 | `031_update_plans.js` | Добавляет `yearly_price`, `max_integrations`, `code` на plans. Переименовывает планы: free→"Бесплатный"(code=free), basic→"Старт"(code=start), "Pro"→"Бизнес"(code=business), "Бизнес"→"Сети"(code=chains) |

## KKT Bridge (Windows Desktop App)

**Location**: `kkt-bridge-windows/`

Electron-based Windows desktop application that connects local АТОЛ fiscal printers to the cloud POS system.

### Architecture

- **Main process** (`src/main.js`):
  - System tray interface
  - Settings window (Electron BrowserWindow)
  - Auto-launch on Windows startup
  - Device pairing flow
  - Manages ATOL and Socket connections

- **ATOL client** (`src/atol.js`):
  - Communicates with АТОЛ Драйвер ККТ 10 via WebRequests API (`http://127.0.0.1:16732`)
  - Supports: sell, sell_return, open_shift, close_shift, x_report
  - Health checks every 10 seconds
  - Receipt printing with fiscal data extraction

- **Socket manager** (`src/socket.js`):
  - WebSocket connection to server with device JWT
  - Heartbeat every 30 seconds
  - Pulls pending receipts on connect
  - Receives real-time print jobs via `fiscal:print` event
  - Reports success/error back to server

- **Renderer** (`src/renderer/`):
  - Settings UI (dark theme, Russian language)
  - Device pairing via pairing URL
  - ATOL connection testing
  - Status indicators

### Workflow

1. **Pairing**: Admin creates pairing token in web UI → copies URL → pastes in bridge → bridge registers with unique device_id → receives device JWT
2. **Online**: Bridge connects to server via WebSocket, joins `device:{deviceId}` room, sends heartbeat
3. **Receipt printing**:
   - POS closes order → server enqueues receipt in `kkt_physical_queue` → emits `fiscal:print` to device room
   - Bridge receives job → calls ATOL API → gets fiscal data → reports back via `/queue/:id/confirm`
   - Server updates order with fiscal_number/fiscal_sign
4. **Offline resilience**: Bridge pulls pending receipts on reconnect

### Build & Deploy

```bash
cd kkt-bridge-windows
npm install
npm run build          # Creates installer in dist/
```

Installer: NSIS with one-click install, desktop shortcut, auto-launch option.

## Client (React 19 + Vite)

- **State**: Zustand stores in `client/src/store/` — `authStore.js` (auth, tenant, branding, pinLogin), `posStore.js` (POS state), `socketStore.js` (WebSocket connection), `partnerStore.js` (партнёрская авторизация: login, register, logout, checkAuth, localStorage persistence), `networkStore.js` (состояние сети)
- **API**: `client/src/api.js` — wrapper around fetch, auto-attaches JWT from localStorage, all calls go to `/api/*` (proxied to :3001 in dev). `client/src/partnerApi.js` — отдельная API-обёртка для партнёрских эндпоинтов (использует `partner_token` из localStorage, не tenant JWT)
- **Routing**: `client/src/App.jsx` — react-router-dom v7. `isSubdomain()` switches between `SubdomainApp` (PinLogin + POS routes) and `MainDomainApp` (Landing, Login, Register, Superadmin, Chain, Partner). Route guards: `ProtectedRoute`, `AdminRoute`, `CashierAllowedRoute`, `FeatureRoute` (checks plan features), `ProtectedPartnerRoute` (проверяет partnerStore)
- **Subdomain utils**: `client/src/utils/subdomain.js` — `getTenantSlug()`, `isSubdomain()`, `buildSubdomainUrl(slug)`. Uses `VITE_BASE_DOMAIN` env var
- **Branding**: `client/src/utils/branding.js` — applies tenant's `accent_color` via CSS custom properties (`--accent`, `--accent-hover`)
- **Partner components**: `PartnerLayout` — layout обёртка для партнёрских страниц (`client/src/components/PartnerLayout.jsx`)
- **Styling**: Dark/light theme via CSS custom properties in `client/src/index.css`, no CSS framework
- **Business type adaptation**: UI adapts based on `tenant.business_type` and `tenant.pos_mode` (table map vs fast POS grid)

### Client page structure

```
MainDomainApp (skandata.ru):
  /                — Landing page (multi-business marketing)
  /login           — owner email/password login → redirect to subdomain
  /register        — new tenant registration (choose business type)
  /accept-invite   — accept chain invitation
  /superadmin      — SuperadminTenants (platform management)
  /chain           — ChainDashboard (chain owner view)
  /chain/tenants   — ChainTenants list
  /chain/sales     — ChainSales analytics
  /chain/comparison — ChainComparison between tenants
  /chain/products  — ChainProducts across chain
  /chain/transfers — ChainTransfers between tenants
  /admin/*         — same admin routes as subdomain (for owner on main domain)
  /partner/login       — PartnerLogin
  /partner/register    — PartnerRegister
  /partner             — PartnerDashboard (ProtectedPartnerRoute)
  /partner/referrals   — PartnerReferrals
  /partner/payouts     — PartnerPayouts

SubdomainApp ({slug}.skandata.ru):
  /login                    — PinLogin (employee list + numpad)
  /                         — HallMap (table service mode) OR FastPOS (fast_pos mode)
  /hall-map                 — HallMap editor (admin+, table service mode only)
  /dashboard                — Dashboard with stats (requires "reports" feature)
  /stats                    — Detailed stats/analytics (admin+, requires "reports" feature)
  /admin/categories         — Category management
  /admin/workshops          — Workshop/цех management
  /admin/products           — Product management (CRUD, variants, modifiers, images)
  /admin/modifiers          — Modifier catalog management
  /admin/ingredients        — Ingredient management
  /admin/ingredient-groups  — Ingredient group management
  /admin/supplies           — Supply deliveries (requires "inventory" feature)
  /admin/register           — Register day (cash shift open/close)
  /admin/users              — Employee management (name + PIN)
  /admin/inventory          — Inventory list (requires "inventory" feature)
  /admin/inventory-check    — Inventory reconciliation (requires "inventory" feature)
  /admin/settings           — Tenant settings (business type, theme, branding)
  /admin/integrations       — Integration settings (ЕГАИС, Честный знак, ЭДО, ККТ)
  /admin/fiscal-devices     — Physical KKT device management (pairing, queue monitoring)
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

**Server** (`server/.env`):
```
PORT=3001
NODE_ENV=development|production
DATABASE_URL=postgres://user:pass@localhost:5432/dbname
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://localhost:5173
BASE_DOMAIN=lvh.me|skandata.ru
BASE_URL=http://lvh.me:3001 (optional, for pairing URLs)
REDIS_URL=redis://localhost:6379 (optional, for socket.io clustering)
```

**Client** (`client/.env`):
```
VITE_BASE_DOMAIN=lvh.me|skandata.ru (must match server)
```

Both default to `lvh.me` for development, `skandata.ru` for production.

## Deploy

Docker multi-stage build (Dockerfile): client build → server with static files. docker-compose: `db` (postgres:16), `app` (node), `nginx` (reverse proxy with wildcard subdomain support). See `DEPLOY.md` for details.

**Files**: Uploads stored in `server/public/uploads/`, served at `/uploads/*`, volume-mounted in docker-compose.

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
- Rate limiting:
  - General API: 1500 req/15min (keyed by host:IP)
  - Auth endpoints: 20 req/15min (keyed by IP)
  - Device pairing: 10 req/15min (keyed by IP)
- Money: stored as `NUMERIC(12,2)`, always `parseFloat()` on read, format as `1 234 ₽` in UI
- Dates: stored as `TIMESTAMPTZ`, displayed in Russian format (`22 февраля 2026`)
- Soft deletes: products, users, modifiers use `active`/`is_active` flag, not actual DELETE
- Mixed payment: orders support cash/card/mixed with `paid_cash` + `paid_card` split
- Feature gating: plan `features` JSONB controls access to modules (inventory, reports, edo, chain_management, kkt) via `checkFeature()` middleware and `FeatureRoute` client guard
- User cache: `server/cache.js` provides in-memory LRU caches (`userById`, `integrationByTenant`) for hot-path queries
- Modifiers: prices added to base product price, inventory tracked via `ingredient_id` FK, denormalized in order_item_modifiers
- Variants: different prices/sizes for same product, selected at order time, stored in `variant_id` on order_items
- Business type switching: UI/UX adapts based on `tenant.business_type` (hookah/cafe/restaurant/fastfood) and `pos_mode` (table_service/fast_pos)
- Fiscal integration: dual-mode support — cloud KKT (АТОЛ Онлайн) OR physical KKT (bridge client). Orders store fiscal data after successful receipt print.
- Партнёрская аутентификация: отдельный JWT с `partner_id`, хранится в `partner_token` в localStorage, обрабатывается через `partnerAuth` middleware. Не смешивается с tenant/superadmin токенами
- Реферальные комиссии: `accrueCommissionIfReferred()` вызывается в subscriptions route при смене/продлении плана, начисляет 30% от стоимости плана
- Таймер стола: `table_timer_mode` ('auto'/'off') на уровне тенанта; в ручном режиме `timer_started_at` хранится в orders
- Структура планов: планы имеют `code` (free/start/business/chains), `yearly_price` для годовых скидок, `max_integrations` для ограничения интеграций

## Key Features by Business Type

### Hookah Bar (default)
- Table service with hall map
- Hookah master assignment
- Workshop-based order routing (кухня, бар, кальянная)
- Guest loyalty program
- Table timer (session duration tracking)

### Cafe / Restaurant
- Table service OR fast POS mode
- Order types: dine in / take away / delivery
- Modifiers for customization (toppings, sizes)
- Product variants (portions, drink sizes)
- Kitchen display system (workshops)

### Fast Food
- Fast POS mode (no table map)
- Quick order entry with product grid
- Order types: dine in / take away / delivery
- Modifiers (extras, sauces)
- Simple receipt printing

## Fiscal Integration

### Cloud KKT (АТОЛ Онлайн)
- Service: `server/services/kkt/`
- Provider: АТОЛ Онлайн API
- Mode: strict (fiscalize before order close) or soft (fiscalize after)
- Receipt stored in `kkt_receipts` table
- Auto token refresh

### Physical KKT (АТОЛ via Bridge)
- Bridge app: `kkt-bridge-windows/` (Electron)
- Communication: WebSocket (socket.io)
- Receipt queue: `kkt_physical_queue`
- Device management: `kkt_physical_devices`
- Pairing: one-time token system
- Offline resilience: bridge pulls pending on reconnect
- Real-time notifications: `fiscal:print`, `fiscal:confirmed`, `fiscal:error`

On order close:
1. If `kkt_enabled + kkt_provider`: create cloud receipt via АТОЛ API
2. If `kkt_physical_enabled`: enqueue receipt → notify bridge → bridge prints → bridge reports fiscal data → server updates order

## Known limitations & TODO

### Not implemented yet
- **Mobile app** — currently web-only, native app in planning
- **Notifications** — no push/email notifications for low stock, shift reminders, subscription expiry
- **Export** — no data export to Excel/CSV or 1C integration
- **Backups** — no automated database backup strategy
- **Online booking** — no table reservation from external widget/website
- **Kitchen display system** — workshop orders visible only in reports, no dedicated KDS screen
- **Multi-language** — currently Russian only

### Known technical debt
- Rate limiting may be too aggressive for POS use during rush hour
- No audit trail for financial operations (only Morgan request logging)
- Stock movements not fully implemented — only basic quantity tracking
- Product images stored locally, no CDN integration
- Bridge client Windows-only, no Mac/Linux versions
