# API Reference

Базовый путь: `/api`. Все эндпоинты возвращают JSON. Авторизация через заголовок `Authorization: Bearer <token>`.

## Коды ошибок

| Код | Значение |
|-----|---------|
| 400 | Некорректный запрос (валидация) |
| 401 | Не авторизован / неверный токен |
| 402 | Подписка не активна или истекла |
| 403 | Нет прав (роль) или превышен лимит плана |
| 404 | Ресурс не найден |
| 500 | Внутренняя ошибка сервера |
| 502 | Ошибка связи с внешним сервисом (ЕГАИС) |

Формат ошибки:
```json
{ "error": "Текст ошибки на русском" }
```

---

## Auth (`/api/auth`)

Публичные эндпоинты (без JWT).

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| POST | `/auth/login` | Вход по email + пароль | Публичный |
| POST | `/auth/register` | Регистрация нового заведения | Публичный |
| POST | `/auth/accept-invite` | Принятие приглашения | Публичный |
| POST | `/auth/pin-login` | Вход по PIN-коду (только на поддомене) | Публичный |
| GET | `/auth/employees` | Список сотрудников с PIN (только на поддомене) | Публичный |
| GET | `/auth/tenant-info` | Бренд заведения (только на поддомене) | Публичный |
| GET | `/auth/me` | Текущий пользователь + tenant | JWT |

### POST `/auth/login`

```json
// Запрос
{ "email": "owner@example.com", "password": "123456" }

// Ответ
{
  "token": "eyJ...",
  "user": { "id": 1, "email": "...", "name": "...", "role": "owner", "tenant_id": 1, "chain_id": null },
  "tenant": { "id": 1, "name": "Мой бар", "slug": "moj-bar", "logo_url": null, "accent_color": "#6366f1" },
  "chain": null
}
```

### POST `/auth/register`

```json
// Запрос
{ "company_name": "Мой бар", "name": "Иван", "email": "ivan@mail.ru", "password": "123456", "slug": "moj-bar" }

// Ответ: такой же формат как login
```

При регистрации автоматически:
- Создаётся tenant с транслитерированным slug
- Создаётся пользователь с ролью `owner`
- Создаётся бесплатная подписка (trial 14 дней)
- Создаются категории по умолчанию (Кальяны, Напитки, Еда)

### POST `/auth/pin-login`

```json
// Запрос (только на поддомене)
{ "user_id": 5, "pin": "1234" }

// Ответ: такой же формат как login
```

### GET `/auth/employees`

Только на поддомене. Без авторизации.

```json
// Ответ
{
  "employees": [
    { "id": 5, "name": "Алексей", "role": "cashier" }
  ],
  "tenant": { "name": "Мой бар", "logo_url": null, "accent_color": "#6366f1" }
}
```

---

## Products (`/api/products`)

Middleware: `auth` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/products` | Список товаров (с ингредиентами и остатками) | Авторизован |
| GET | `/products/low-stock` | Товары с низким остатком | Авторизован |
| GET | `/products/:id` | Один товар | Авторизован |
| POST | `/products` | Создать товар | admin+ |
| PUT | `/products/:id` | Обновить товар | admin+ |
| PUT | `/products/:id/ingredients` | Установить техкарту (ингредиенты) | admin+ |
| DELETE | `/products/:id` | Деактивировать товар (soft delete) | admin+ |

### POST `/products`

```json
{
  "category_id": 1,
  "name": "Классический кальян",
  "price": 1500,
  "cost_price": 300,
  "quantity": 0,
  "unit": "шт",
  "track_inventory": true,
  "is_composite": false,
  "min_quantity": 0,
  "barcode": null,
  "marking_type": "none",
  "egais_alcocode": null,
  "tobacco_gtin": null
}
```

### PUT `/products/:id/ingredients`

```json
{
  "ingredients": [
    { "ingredient_id": 10, "amount": 25 },
    { "ingredient_group_id": 3, "amount": 15 }
  ],
  "output_amount": 1,
  "recipe_description": "Описание рецепта"
}
```

---

## Categories (`/api/categories`)

Middleware: `auth` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/categories` | Список категорий | Авторизован |
| POST | `/categories` | Создать категорию | admin+ |
| PUT | `/categories/:id` | Обновить категорию | admin+ |
| DELETE | `/categories/:id` | Деактивировать (soft delete) | admin+ |

### POST `/categories`

```json
{ "name": "Кальяны", "color": "#6366f1", "sort_order": 0, "workshop_id": null }
```

---

## Orders (`/api/orders`)

Middleware: `auth` + `checkSubscription` + `loadIntegrations`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/orders` | Список заказов (фильтр по status) | Авторизован |
| GET | `/orders/:id` | Детали заказа с позициями | Авторизован |
| POST | `/orders` | Создать заказ | Авторизован |
| POST | `/orders/:id/items` | Добавить позицию в заказ | Авторизован |
| PUT | `/orders/:id/items/:itemId` | Изменить количество позиции | Авторизован |
| DELETE | `/orders/:id/items/:itemId` | Удалить позицию | Авторизован |
| POST | `/orders/:id/close` | Оплатить и закрыть заказ | Авторизован |
| POST | `/orders/:id/cancel` | Отменить заказ | Авторизован |
| PATCH | `/orders/:id/payment-method` | Изменить способ оплаты закрытого заказа | Авторизован |

### POST `/orders`

```json
{ "table_id": 5 }
```

Требует открытый кассовый день. Если на столике уже есть открытый заказ — ошибка 400.

### POST `/orders/:id/items`

```json
{ "product_id": 10, "quantity": 1 }
```

Если позиция с этим товаром уже есть — количество суммируется. Если `quantity` отрицательное и результат ≤ 0 — позиция удаляется.

### POST `/orders/:id/close`

```json
{
  "payment_method": "mixed",
  "guest_id": 3,
  "paid_cash": 500,
  "paid_card": 1000
}
```

`payment_method`: `cash` | `card` | `mixed`. При `mixed` обязательны `paid_cash` и `paid_card`, их сумма должна совпадать с итогом. Если указан `guest_id` — применяется скидка гостя. При закрытии автоматически списываются остатки.

---

## Halls (`/api/halls`)

Middleware: `auth` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/halls` | Список залов | Авторизован |
| POST | `/halls` | Создать зал | admin+ |
| PUT | `/halls/:id` | Обновить зал | admin+ |
| DELETE | `/halls/:id` | Деактивировать зал | admin+ |
| GET | `/halls/:id/tables` | Столы зала | Авторизован |
| POST | `/halls/:id/tables` | Добавить стол | admin+ |
| DELETE | `/halls/:hallId/tables/:tableId` | Удалить стол | admin+ |

### POST `/halls`

```json
{ "name": "Основной зал", "grid_cols": 6, "grid_rows": 4 }
```

### POST `/halls/:id/tables`

```json
{
  "number": 1,
  "grid_x": 2, "grid_y": 1,
  "seats": 4,
  "shape": "square",
  "width": 72, "height": 72,
  "label": "VIP"
}
```

`shape`: `square` | `rectangle` | `round` | `corner`.

---

## Tables (`/api/tables`)

Middleware: `auth` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/tables` | Все столы всех залов | Авторизован |
| PUT | `/tables/:id/position` | Изменить позицию стола | Авторизован |
| PATCH | `/tables/:id` | Обновить параметры стола | Авторизован |

---

## Register (Кассовый день) (`/api/register`)

Middleware: `auth` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/register/current` | Текущий открытый кассовый день | Авторизован |
| GET | `/register/history` | Последние 30 кассовых дней | Авторизован |
| POST | `/register/open` | Открыть кассовый день | Авторизован |
| POST | `/register/close` | Закрыть кассовый день | Авторизован |
| GET | `/register/current/workshops` | Выручка по цехам за текущий день | Авторизован |

### POST `/register/open`

```json
{ "opening_cash": 5000 }
```

### POST `/register/close`

```json
{ "actual_cash": 15300 }
```

Нельзя закрыть день при наличии открытых заказов.

---

## Stats / Reports (`/api/stats`)

Middleware: `auth` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/stats/dashboard` | Дашборд: выручка, прибыль, тренд, топ товаров | Авторизован |
| GET | `/stats/sales` | Продажи по периоду (day/month) | Авторизован |
| GET | `/stats/products` | Топ товаров и категорий по выручке | Авторизован |
| GET | `/stats/cost-analysis` | Анализ себестоимости и маржинальности | Авторизован |
| GET | `/stats/traffic` | Посещаемость (по часам и дням недели) | Авторизован |
| GET | `/stats/employees` | Статистика сотрудников | Авторизован |
| GET | `/stats/discounts` | Анализ скидок (общий и по гостям) | Авторизован |
| GET | `/stats/inventory` | Отчёт по складским остаткам | admin+ |
| GET | `/stats/shift/:id` | Детальный отчёт по смене | Авторизован |

### Параметры фильтрации

Большинство отчётов принимают `?from=YYYY-MM-DD&to=YYYY-MM-DD`. По умолчанию — последние 30 дней.

`/stats/sales` также принимает `?group=day|month`.

---

## Users / Employees (`/api/users`)

Middleware: `auth` + `adminOnly` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/users` | Список сотрудников | admin+ |
| POST | `/users` | Создать сотрудника | admin+ |
| PUT | `/users/:id` | Обновить сотрудника | admin+ |
| DELETE | `/users/:id` | Деактивировать (soft delete) | admin+ |

### POST `/users`

Два варианта создания:

**По PIN (рекомендуемый для кассиров):**
```json
{ "name": "Алексей", "pin": "1234", "role": "cashier" }
```

**По email + пароль:**
```json
{ "name": "Менеджер", "email": "manager@mail.ru", "password": "123456", "role": "admin" }
```

PIN: ровно 4 цифры, уникален в пределах заведения (проверяется через bcrypt compare).

---

## Guests (Гости / Лояльность) (`/api/guests`)

Middleware: `auth` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/guests` | Список гостей (поиск: `?search=`) | Авторизован |
| GET | `/guests/:id` | Один гость | Авторизован |
| GET | `/guests/:id/stats` | Статистика гостя (заказы, скидки) | Авторизован |
| POST | `/guests` | Создать гостя | admin+ |
| PUT | `/guests/:id` | Обновить гостя | admin+ |
| DELETE | `/guests/:id` | Деактивировать | admin+ |

### POST `/guests`

```json
{
  "name": "Постоянный клиент",
  "phone": "+7999123456",
  "discount_type": "percent",
  "discount_value": 10,
  "bonus_balance": 0
}
```

`discount_type`: `percent` | `fixed`.

---

## Ingredients (`/api/ingredients`)

Middleware: `auth` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/ingredients` | Список ингредиентов | Авторизован |
| GET | `/ingredients/:id` | Один ингредиент | Авторизован |
| POST | `/ingredients` | Создать ингредиент | admin+ |
| PUT | `/ingredients/:id` | Обновить | admin+ |
| DELETE | `/ingredients/:id` | Деактивировать | admin+ |

Ингредиенты — это `products` с флагом `is_ingredient = true`. Не продаются напрямую, используются в техкартах.

---

## Ingredient Groups (`/api/ingredient-groups`)

Middleware: `auth` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/ingredient-groups` | Список групп | Авторизован |
| POST | `/ingredient-groups` | Создать группу | admin+ |
| PUT | `/ingredient-groups/:id` | Обновить | admin+ |
| DELETE | `/ingredient-groups/:id` | Удалить (убирает членов из группы) | admin+ |
| GET | `/ingredient-groups/:id/members` | Члены группы с остатками | Авторизован |

Группы ингредиентов объединяют взаимозаменяемые ингредиенты. При списании по техкарте расход распределяется пропорционально остаткам членов группы.

---

## Workshops (Цеха) (`/api/workshops`)

Middleware: `auth` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/workshops` | Список цехов | Авторизован |
| POST | `/workshops` | Создать цех | admin+ |
| PUT | `/workshops/:id` | Обновить | admin+ |
| DELETE | `/workshops/:id` | Удалить (отвязывает категории) | admin+ |

Цеха используются для группировки категорий и печати кухонных тикетов.

---

## Supplies (Поставки) (`/api/supplies`)

Middleware: `auth` + `adminOnly` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/supplies` | Список поставок с позициями | admin+ |
| POST | `/supplies` | Создать поставку (автоматически обновляет остатки и себестоимость) | admin+ |

### POST `/supplies`

```json
{
  "supplier": "ООО Табак",
  "note": "Ежемесячная поставка",
  "items": [
    { "product_id": 10, "quantity": 100, "unit_cost": 50 }
  ]
}
```

При приёмке пересчитывается средневзвешенная себестоимость: `(old_qty * old_cost + new_qty * new_cost) / total_qty`.

---

## Inventories (Инвентаризация) (`/api/inventories`)

Middleware: `auth` + `adminOnly` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/inventories` | Список инвентаризаций | admin+ |
| POST | `/inventories` | Начать инвентаризацию | admin+ |
| GET | `/inventories/:id` | Детали с позициями | admin+ |
| PUT | `/inventories/:id/items` | Ввести фактические количества | admin+ |
| POST | `/inventories/:id/apply` | Применить (обновить остатки) | admin+ |

Одновременно может быть только одна открытая инвентаризация.

---

## Tenant Settings (`/api/tenant`)

Middleware: `auth`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/tenant` | Настройки заведения | Авторизован |
| PUT | `/tenant` | Обновить название, лого, цвет | owner |
| POST | `/tenant/invite` | Пригласить сотрудника по email | admin+ |
| GET | `/tenant/users` | Список пользователей и приглашений | admin+ |
| GET | `/tenant/print-settings` | Настройки печати чеков | Авторизован |
| PUT | `/tenant/print-settings` | Обновить настройки печати | owner |

### PUT `/tenant/print-settings`

```json
{
  "receipt_width": "80mm",
  "receipt_header": "Название бара",
  "receipt_footer": "Спасибо за визит!",
  "auto_print_receipt": false
}
```

---

## Subscription (`/api/subscription`)

Middleware: `auth`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/subscription` | Текущая подписка + список планов | Авторизован |
| POST | `/subscription/change-plan` | Сменить план | owner |

---

## Integrations (`/api/integrations`)

Middleware: `auth` + `checkSubscription`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/integrations` | Настройки интеграций | Авторизован |
| PUT | `/integrations` | Сохранить настройки | owner |
| POST | `/integrations/test-egais` | Тест подключения к ЕГАИС УТМ | owner |
| POST | `/integrations/test-chestniy-znak` | Тест подключения к Честному знаку | owner |

---

## EGAIS (`/api/egais`)

Middleware: `auth` + `checkSubscription` + `loadIntegrations` + `requireEgais`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/egais/incoming` | Входящие документы из УТМ | admin+ |
| GET | `/egais/incoming/:docId` | Детали входящего документа | admin+ |
| POST | `/egais/ttn/:wayBillId/accept` | Подтвердить ТТН | admin+ |
| POST | `/egais/ttn/:wayBillId/reject` | Отклонить ТТН | admin+ |
| POST | `/egais/transfer-to-shop` | Перемещение на Регистр 2 | admin+ |
| POST | `/egais/write-off` | Списание | admin+ |
| POST | `/egais/query-stock` | Запросить остатки в ЕГАИС | admin+ |
| GET | `/egais/stock/:registerType` | Кеш остатков (reg1/reg2) | Авторизован |
| GET | `/egais/documents` | Журнал документов ЕГАИС | Авторизован |
| GET | `/egais/documents/:id` | Конкретный документ из журнала | Авторизован |

---

## Marking (Маркировка) (`/api/marking`)

Middleware: `auth` + `checkSubscription` + `loadIntegrations`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/marking` | Список маркированных единиц | Авторизован |
| POST | `/marking/scan` | Сканировать код маркировки | Авторизован |
| GET | `/marking/supply/:supplyId` | Коды маркировки по поставке | Авторизован |
| GET | `/marking/order/:orderId` | Коды маркировки по заказу | Авторизован |
| POST | `/marking/:id/write-off` | Списать маркированную единицу | admin+ |

### POST `/marking/scan`

```json
{
  "code": "010460043993125621JgXJ5.T",
  "context": "supply",
  "context_id": 15,
  "product_id": 10
}
```

`context`: `supply` | `order`. Тип маркировки определяется автоматически по формату кода.

---

## Chain (Сети заведений) (`/api/chain`)

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| POST | `/chain/create` | Создать сеть (привязать текущий tenant) | owner + feature `chain_management` |
| GET | `/chain/tenants` | Список заведений сети с KPI | chain_owner |
| POST | `/chain/tenants` | Создать новое заведение в сети | chain_owner |
| GET | `/chain/tenants/search` | Поиск заведений для добавления | chain_owner |
| POST | `/chain/tenants/link` | Привязать существующее заведение | chain_owner |
| DELETE | `/chain/tenants/:tenantId` | Отвязать заведение | chain_owner |
| POST | `/chain/impersonate` | Войти в заведение сети | chain_owner |
| GET | `/chain/stats/dashboard` | Дашборд сети (агрегированные KPI) | chain_owner |
| GET | `/chain/stats/sales` | Продажи по сети (с разбивкой по заведениям) | chain_owner |
| GET | `/chain/stats/comparison` | Сравнение заведений | chain_owner |
| GET | `/chain/stats/products` | Топ товаров по всей сети | chain_owner |

---

## Superadmin (`/api/superadmin`)

Middleware: `auth` + `superadminOnly`.

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/superadmin/tenants` | Все заведения с подписками | superadmin |
| POST | `/superadmin/impersonate` | Имперсонация заведения | superadmin |
| PUT | `/superadmin/tenants/:id/subscription` | Управление подпиской заведения | superadmin |
| GET | `/superadmin/plans` | Список планов | superadmin |
| GET | `/superadmin/chains` | Список сетей | superadmin |
| POST | `/superadmin/chains` | Создать сеть + chain_owner | superadmin |
