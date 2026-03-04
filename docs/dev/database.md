# База данных

PostgreSQL 16. Все бизнес-таблицы содержат `tenant_id` для мультитенантной изоляции.

## Правила

- Деньги: `NUMERIC(12,2)`, при чтении из pg всегда `parseFloat()`
- Количества: `NUMERIC(12,3)` (дробные единицы: граммы, миллилитры)
- Параметры запросов: нумерованные `$1, $2, $3` (PostgreSQL стиль)
- Soft delete: `active BOOLEAN DEFAULT true` вместо физического DELETE
- Timestamps: `TIMESTAMP DEFAULT NOW()`
- ID: `SERIAL PRIMARY KEY`

## Таблицы

### Мультитенантность

#### tenants

Заведения (компании-арендаторы).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| name | VARCHAR(255) | Название компании |
| slug | VARCHAR(100) UNIQUE | Поддомен (`my-bar` → `my-bar.hookahpos.ru`) |
| logo_url | TEXT | URL логотипа |
| accent_color | VARCHAR(7) | Акцентный цвет (`#6366f1`) |
| active | BOOLEAN | |
| created_at | TIMESTAMP | |

#### plans

Тарифные планы.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| name | VARCHAR(100) UNIQUE | `free`, `basic`, `pro`, `business` |
| price | NUMERIC(10,2) | Цена в рублях/месяц |
| max_users | INTEGER | Лимит пользователей |
| max_halls | INTEGER | Лимит залов |
| max_products | INTEGER | Лимит товаров |
| features | JSONB | Фичи: `{"reports": true, "chain_management": true}` |
| active | BOOLEAN | |

Стандартные планы:
- **free** — 0 ₽, 2 пользователя, 1 зал, 30 товаров
- **basic** — 990 ₽, 5 пользователей, 3 зала, 200 товаров
- **pro** — 2490 ₽, 20 пользователей, 10 залов, 1000 товаров
- **business** — 4990 ₽, 50 пользователей, 20 залов, 5000 товаров, управление сетью

#### subscriptions

Подписки заведений на тарифные планы.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| plan_id | INTEGER FK → plans | |
| status | VARCHAR(20) | `active`, `trialing`, `past_due`, `cancelled`, `expired` |
| current_period_start | TIMESTAMP | Начало текущего периода |
| current_period_end | TIMESTAMP | Конец периода (проверяется в middleware) |
| cancelled_at | TIMESTAMP | Дата отмены |

#### chains

Сети заведений.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| name | VARCHAR(255) | Название сети |
| created_at | TIMESTAMP | |

#### chain_tenants

Связь сетей и заведений (many-to-many).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| chain_id | INTEGER FK → chains | |
| tenant_id | INTEGER FK → tenants | UNIQUE(chain_id, tenant_id) |
| added_at | TIMESTAMP | |

### Пользователи

#### users

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| username | VARCHAR(100) UNIQUE | Логин |
| email | VARCHAR(255) | Email (для login и приглашений) |
| password | TEXT | bcrypt hash |
| pin_hash | TEXT | bcrypt hash 4-значного PIN |
| name | VARCHAR(255) | Отображаемое имя |
| role | VARCHAR(20) | `superadmin`, `chain_owner`, `owner`, `admin`, `cashier` |
| tenant_id | INTEGER FK → tenants | Заведение (null для superadmin и chain_owner) |
| chain_id | INTEGER FK → chains | Сеть (для chain_owner и owner в сети) |
| active | BOOLEAN | Soft delete |
| created_at | TIMESTAMP | |

#### invitations

Приглашения сотрудников по email.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| email | VARCHAR(255) | |
| role | VARCHAR(20) | Роль приглашённого |
| token | VARCHAR(255) UNIQUE | Токен для ссылки |
| accepted | BOOLEAN | Принято ли |
| expires_at | TIMESTAMP | Срок действия (7 дней) |
| created_by | INTEGER FK → users | Кто пригласил |

### Каталог

#### categories

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| name | VARCHAR(255) | |
| color | VARCHAR(20) | Цвет для UI (`#6366f1`) |
| sort_order | INTEGER | Порядок сортировки |
| workshop_id | INTEGER FK → workshops | Привязка к цеху |
| active | BOOLEAN | |

#### products

Товары и ингредиенты (ингредиенты: `is_ingredient = true`).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| category_id | INTEGER FK → categories | |
| name | VARCHAR(255) | |
| price | NUMERIC(12,2) | Цена продажи (0 для ингредиентов) |
| cost_price | NUMERIC(12,2) | Себестоимость |
| quantity | NUMERIC(12,3) | Текущий остаток |
| unit | VARCHAR(10) | `шт`, `г`, `мл`, `порц` |
| track_inventory | BOOLEAN | Учитывать остатки |
| is_composite | BOOLEAN | Составной товар (техкарта) |
| is_ingredient | BOOLEAN | Это ингредиент |
| output_amount | NUMERIC(12,3) | Выход по техкарте |
| recipe_description | TEXT | Описание рецепта |
| min_quantity | NUMERIC(12,3) | Минимальный остаток (для уведомлений) |
| ingredient_group_id | INTEGER FK → ingredient_groups | Группа ингредиентов |
| barcode | VARCHAR(50) | Штрихкод |
| marking_type | VARCHAR(20) | `none`, `tobacco`, `egais` |
| egais_alcocode | VARCHAR(64) | Код ЕГАИС |
| tobacco_gtin | VARCHAR(14) | GTIN табачной продукции |
| active | BOOLEAN | |

#### product_ingredients

Техкарта: связь товара с ингредиентами.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| product_id | INTEGER FK → products | Составной товар |
| ingredient_id | INTEGER FK → products | Конкретный ингредиент |
| ingredient_group_id | INTEGER FK → ingredient_groups | Или группа ингредиентов |
| amount | NUMERIC(12,3) | Количество на порцию |

#### ingredient_groups

Группы взаимозаменяемых ингредиентов.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| name | VARCHAR(255) | |
| unit | VARCHAR(10) | Единица измерения |
| active | BOOLEAN | |

#### workshops

Цеха (кухня, бар, кальянная).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| name | VARCHAR(255) | |
| active | BOOLEAN | |

### Залы и столы

#### halls

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| name | VARCHAR(255) | |
| grid_cols | INTEGER | Ширина сетки (2–12, default 6) |
| grid_rows | INTEGER | Высота сетки (2–12, default 4) |
| active | BOOLEAN | |

#### tables

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| hall_id | INTEGER FK → halls | |
| number | INTEGER | Номер стола |
| x | NUMERIC(10,2) | Позиция X (% от ширины) |
| y | NUMERIC(10,2) | Позиция Y (% от высоты) |
| grid_x | INTEGER | Позиция в сетке |
| grid_y | INTEGER | Позиция в сетке |
| seats | INTEGER | Количество мест (1–24) |
| shape | VARCHAR(20) | `square`, `rectangle`, `round`, `corner` |
| width | NUMERIC(10,2) | Ширина (48–200px) |
| height | NUMERIC(10,2) | Высота (48–200px) |
| label | VARCHAR(50) | Метка (VIP, терраса и т.п.) |
| active | BOOLEAN | |

### Заказы и касса

#### orders

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| table_id | INTEGER FK → tables | |
| register_day_id | INTEGER FK → register_days | Кассовый день |
| user_id | INTEGER FK → users | Кассир |
| guest_id | INTEGER FK → guests | Гость (для скидки) |
| status | VARCHAR(20) | `open`, `closed`, `cancelled` |
| payment_method | VARCHAR(20) | `cash`, `card`, `mixed` |
| total | NUMERIC(12,2) | Итог к оплате (после скидки) |
| total_before_discount | NUMERIC(12,2) | Итог до скидки |
| discount_amount | NUMERIC(12,2) | Сумма скидки |
| paid_cash | NUMERIC(12,2) | Оплачено наличными |
| paid_card | NUMERIC(12,2) | Оплачено картой |
| created_at | TIMESTAMP | |
| closed_at | TIMESTAMP | |

#### order_items

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| order_id | INTEGER FK → orders | |
| product_id | INTEGER FK → products | |
| product_name | VARCHAR(255) | Денормализовано (на момент заказа) |
| quantity | INTEGER | |
| price | NUMERIC(12,2) | Цена за единицу |
| cost_price | NUMERIC(12,2) | Себестоимость за единицу |
| total | NUMERIC(12,2) | `quantity * price` |
| marking_type | VARCHAR(20) | Тип маркировки |
| marked_codes_scanned | INTEGER | Отсканировано кодов |
| marked_codes_required | INTEGER | Требуется кодов |

#### register_days

Кассовые дни (смены).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| opened_at | TIMESTAMP | |
| closed_at | TIMESTAMP | |
| opened_by | INTEGER FK → users | |
| closed_by | INTEGER | |
| opening_cash | NUMERIC(12,2) | Начальная сумма |
| expected_cash | NUMERIC(12,2) | Ожидаемая наличность |
| actual_cash | NUMERIC(12,2) | Фактическая наличность |
| total_cash | NUMERIC(12,2) | Итого наличными |
| total_card | NUMERIC(12,2) | Итого картой |
| total_sales | NUMERIC(12,2) | Итого продажи |
| status | VARCHAR(20) | `open`, `closed` |

### Поставки и инвентаризация

#### supplies

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| supplier | VARCHAR(255) | Поставщик |
| note | TEXT | Комментарий |
| total | NUMERIC(12,2) | Сумма поставки |
| user_id | INTEGER FK → users | Кто принял |
| created_at | TIMESTAMP | |

#### supply_items

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| supply_id | INTEGER FK → supplies | |
| product_id | INTEGER FK → products | |
| quantity | NUMERIC(12,3) | Количество |
| unit_cost | NUMERIC(12,2) | Цена за единицу |
| marking_type | VARCHAR(20) | |
| marked_count | INTEGER | Отсканировано маркировок |
| expected_marked_count | INTEGER | Ожидается маркировок |

#### inventories

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| user_id | INTEGER FK → users | |
| note | TEXT | |
| status | VARCHAR(20) | `open`, `closed` |
| created_at | TIMESTAMP | |
| closed_at | TIMESTAMP | |

#### inventory_items

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| inventory_id | INTEGER FK → inventories | |
| product_id | INTEGER FK → products | |
| product_name | VARCHAR(255) | |
| unit | VARCHAR(10) | |
| system_quantity | NUMERIC(12,3) | Системный остаток |
| actual_quantity | NUMERIC(12,3) | Фактический (вводит пользователь) |

### Гости и лояльность

#### guests

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| name | VARCHAR(255) | |
| phone | VARCHAR(50) | |
| discount_type | VARCHAR(20) | `percent`, `fixed` |
| discount_value | NUMERIC(12,2) | Размер скидки |
| bonus_balance | NUMERIC(12,2) | Бонусный баланс |
| active | BOOLEAN | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### Маркировка и ЕГАИС

#### tenant_integrations

Настройки интеграций заведения.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER UNIQUE FK → tenants | |
| egais_enabled | BOOLEAN | ЕГАИС включён |
| egais_utm_host | VARCHAR(255) | Хост УТМ |
| egais_utm_port | INTEGER | Порт УТМ |
| egais_fsrar_id | VARCHAR(20) | ФСРАР ИД |
| chestniy_znak_enabled | BOOLEAN | Честный знак включён |
| chestniy_znak_token | TEXT | API токен |
| chestniy_znak_omsid | VARCHAR(64) | OMS ID |
| chestniy_znak_environment | VARCHAR(20) | `sandbox`, `production` |

#### marked_items

Маркированные единицы товара.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| product_id | INTEGER FK → products | |
| marking_code | TEXT | Код маркировки (DataMatrix и т.п.) |
| marking_type | VARCHAR(20) | `tobacco`, `egais` |
| status | VARCHAR(20) | `received`, `sold`, `written_off` |
| egais_fsm | VARCHAR(150) | ФСМ (алкоголь) |
| tobacco_cis | TEXT | CIS (табак) |
| tobacco_gtin | VARCHAR(14) | |
| tobacco_serial | VARCHAR(30) | |
| tobacco_mrp | NUMERIC(12,2) | Максимальная розничная цена |
| supply_id | INTEGER FK → supplies | |
| order_id | INTEGER FK → orders | |

#### egais_documents, egais_stock, chestniy_znak_operations

Таблицы для журнала ЕГАИС-документов, кеша остатков ЕГАИС и лога операций Честного знака. Детали в миграции 005.

### Настройки печати

#### tenant_print_settings

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | SERIAL PK | |
| tenant_id | INTEGER FK → tenants | |
| receipt_width | VARCHAR(10) | `58mm`, `80mm` |
| receipt_header | TEXT | Шапка чека |
| receipt_footer | TEXT | Подвал чека |
| auto_print_receipt | BOOLEAN | Автопечать при оплате |

## Связи

```
chains ←── chain_tenants ──→ tenants
tenants ──→ plans (через subscriptions)
tenants ──→ users, categories, products, halls, register_days, orders, supplies, inventories, guests

users ──→ tenants (tenant_id)
users ──→ chains (chain_id)

categories ──→ workshops (workshop_id)
products ──→ categories (category_id)
products ──→ ingredient_groups (ingredient_group_id)
product_ingredients ──→ products (product_id, ingredient_id)
product_ingredients ──→ ingredient_groups (ingredient_group_id)

halls ──→ tables (one-to-many)
orders ──→ tables, users, guests, register_days (many-to-one)
orders ──→ order_items (one-to-many)

supplies ──→ supply_items (one-to-many)
inventories ──→ inventory_items (one-to-many)

marked_items ──→ products, supplies, orders
```

## Миграции

Миграции находятся в `server/migrations/` и запускаются через `node migrations/run.js`. Все миграции идемпотентны (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).

| # | Файл | Описание |
|---|------|----------|
| 001 | `001_initial_schema.js` | Начальная схема: users, halls, tables, categories, products, product_ingredients, supplies, supply_items, register_days, orders, order_items, inventories, inventory_items |
| 002 | `002_multi_tenant.js` | Мультитенантность: tenants, plans, subscriptions, invitations. Добавление tenant_id ко всем таблицам. Роль `owner`. Стандартные планы (free/basic/pro) |
| 003 | `003_add_ingredients.js` | Поле `is_ingredient` в products |
| 004 | `004_superadmin.js` | Роль `superadmin` |
| 005 | `005_marking_egais.js` | Маркировка и ЕГАИС: tenant_integrations, marked_items, egais_documents, egais_stock, chestniy_znak_operations. Поля barcode, marking_type, egais_alcocode, tobacco_gtin в products |
| 006 | `006_guests_loyalty.js` | Гости и лояльность: guests. Поля guest_id, discount_amount, total_before_discount в orders |
| 007 | `007_ingredient_groups.js` | Группы ингредиентов: ingredient_groups. Поле ingredient_group_id в products и product_ingredients |
| 008 | `008_workshops.js` | Цеха: workshops. Поле workshop_id в categories |
| 009 | `009_hall_grid.js` | Сетка залов: grid_cols, grid_rows в halls; grid_x, grid_y в tables |
| 010 | `010_plans_dedupe.js` | Дедупликация планов, UNIQUE(name) на plans |
| 011 | `011_subdomain_pin_auth.js` | PIN-авторизация: pin_hash в users. Slug в tenants |
| 012 | `012_print_settings.js` | Настройки печати: tenant_print_settings |
| 013 | `013_table_labels.js` | Метки столов: label в tables |
| 014 | `014_chains.js` | Сети заведений: chains, chain_tenants. Поле chain_id в users. Роль `chain_owner` |
| 015 | `015_business_plan.js` | Бизнес-план с фичей `chain_management` |
| 016 | `016_mixed_payment.js` | Смешанная оплата: paid_cash, paid_card в orders. Значение `mixed` в payment_method |
| 017 | `017_performance_indexes.js` | Индексы производительности для часто используемых запросов |
