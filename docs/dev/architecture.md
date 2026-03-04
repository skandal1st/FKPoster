# Архитектура

## Стек технологий

| Компонент | Технология |
|-----------|-----------|
| Клиент | React 19 + Vite |
| Сервер | Node.js + Express |
| База данных | PostgreSQL 16 |
| Кеш / адаптер WS | Redis 7 |
| WebSocket | Socket.io |
| Процесс-менеджер | PM2 (cluster mode) |
| Reverse proxy | Nginx |
| Контейнеризация | Docker + Docker Compose |

## Структура каталогов

```
fkgposters/
├── client/                  # React SPA
│   ├── src/
│   │   ├── api.js           # HTTP-клиент (fetch + JWT)
│   │   ├── App.jsx          # Роутинг: MainDomainApp / SubdomainApp
│   │   ├── index.css        # Глобальные стили, тёмная тема
│   │   ├── components/      # Переиспользуемые компоненты
│   │   ├── pages/           # Страницы (по разделам)
│   │   ├── store/           # Zustand-сторы
│   │   └── utils/           # Утилиты (subdomain, branding)
│   └── vite.config.js       # Dev-сервер, proxy → :3001
├── server/
│   ├── index.js             # Entry point: Express, CORS, rate limiting
│   ├── config.js            # Чтение .env
│   ├── db.js                # pg Pool + хелперы (run, all, get, transaction)
│   ├── cache.js             # In-memory LRU-кеш с TTL
│   ├── socket.js            # Socket.io: JWT-авторизация, Redis adapter
│   ├── middleware/           # Цепочка middleware
│   ├── routes/              # 22 файла маршрутов
│   ├── services/            # Бизнес-логика (ЕГАИС)
│   ├── utils/               # Утилиты (slugify, emitEvent)
│   ├── migrations/          # 17 миграций + run.js
│   └── ecosystem.config.js  # PM2 конфигурация
├── nginx/
│   └── conf.d/default.conf  # Reverse proxy с wildcard-поддоменами
├── docker-compose.yml       # 4 сервиса: db, redis, app, nginx
├── Dockerfile               # Multi-stage: client build → production server
└── CLAUDE.md                # Описание проекта для AI-ассистента
```

## Мультитенантность

Используется **row-level изоляция** — каждая бизнес-таблица содержит колонку `tenant_id`. Все запросы фильтруются по `req.tenantId`, который устанавливается в middleware из JWT-токена.

```
SELECT * FROM orders WHERE tenant_id = $1 AND status = 'open'
```

Суперадмин может имперсонировать любой tenant через специальный JWT-payload (`superadmin_impersonating: true`). Владелец сети может имперсонировать заведения своей сети (`chain_impersonating: true`).

## Система поддоменов

Каждое заведение имеет уникальный **slug** (транслитерация названия), определяющий поддомен:

- `my-bar.hookahpos.ru` — рабочий поддомен заведения
- `hookahpos.ru` — главный домен (регистрация, суперадмин-панель)

В dev-режиме используется `lvh.me` (резолвится в `127.0.0.1`): `my-bar.lvh.me:5173`.

### Как работает

1. **Nginx** принимает запрос на `*.hookahpos.ru`
2. **Subdomain middleware** (`server/middleware/subdomain.js`) парсит `Host` / `X-Forwarded-Host` заголовок
3. Извлекает `slug` из `{slug}.{BASE_DOMAIN}`
4. Находит tenant в БД (с кешированием)
5. Устанавливает `req.subdomainTenant` и `req.isMainDomain`

На поддомене:
- Доступен PIN-вход для сотрудников
- Публичный endpoint `/api/auth/employees` отдаёт список сотрудников с PIN
- Бренд заведения (лого, акцентный цвет) применяется к интерфейсу

## Цепочка Middleware

Типичный запрос проходит через цепочку:

```
subdomainMiddleware (глобально)
  → authMiddleware (JWT → req.user, req.tenantId)
    → tenantMiddleware (проверка req.tenantId)
      → checkSubscription (402 если подписка истекла)
        → checkLimit('resource') (403 если лимит плана)
          → checkFeature('feature') (403 если фича недоступна)
            → loadIntegrations (ЕГАИС, Честный знак)
              → route handler
```

### Middleware

| Файл | Назначение |
|------|-----------|
| `subdomain.js` | Парсит Host, определяет tenant по slug, устанавливает `req.subdomainTenant` |
| `auth.js` | JWT-верификация, загрузка пользователя, установка `req.user` и `req.tenantId`. Guards: `adminOnly`, `ownerOnly`, `superadminOnly`, `chainOwnerOnly` |
| `tenant.js` | Отклоняет запрос если `req.tenantId` не определён |
| `subscription.js` | Проверяет активность подписки (`checkSubscription`), лимиты плана (`checkLimit`), доступность фич (`checkFeature`) |
| `integration.js` | Загружает настройки интеграций tenant'а (ЕГАИС, Честный знак). Guards: `requireEgais`, `requireChestniyZnak` |

## WebSocket (Socket.io)

### Сервер (`server/socket.js`)

- JWT-авторизация на handshake (берёт token из `socket.handshake.auth.token`)
- Пользователь присоединяется к комнате `tenant:{tenantId}`
- В production — Redis adapter для работы с кластером PM2

### Отправка событий (`server/utils/emitEvent.js`)

Route-хендлеры вызывают `emitEvent(req, eventName, data)` после изменений в БД. Событие отправляется всем подключенным к комнате tenant'а.

### События

| Событие | Когда |
|---------|-------|
| `order:created` | Создан новый заказ |
| `order:updated` | Изменены позиции или сумма заказа |
| `order:closed` | Заказ оплачен |
| `order:cancelled` | Заказ отменён |
| `register:opened` | Открыт кассовый день |
| `register:closed` | Закрыт кассовый день |

### Клиент (`client/src/store/socketStore.js`)

Zustand-стор управляет подключением. При получении события обновляются данные на экране в реальном времени (другие терминалы видят изменения без перезагрузки).

### Vite Proxy

В dev-режиме Vite проксирует `/socket.io` → `localhost:3001` с `ws: true`:

```js
// vite.config.js
proxy: {
  '/socket.io': {
    target: 'http://localhost:3001',
    ws: true,
  },
}
```

## Кеширование

`server/cache.js` реализует in-memory LRU-кеш с TTL для часто запрашиваемых данных:

- **tenantBySlug** — tenant по slug (из subdomain middleware)
- **userById** — пользователь по ID (из auth middleware)
- **subscriptionByTenant** — подписка (из subscription middleware)
- **resourceCount** — количество ресурсов для проверки лимитов
- **integrationByTenant** — настройки интеграций

Кеш инвалидируется вручную при обновлении данных через хелперы `invalidateUser()`, `invalidateTenant()`, `invalidateSubscription()`, и т.д.

## CORS

CORS настроен динамически — разрешены запросы с:

- `localhost` и `127.0.0.1` (разработка)
- `BASE_DOMAIN` и все его поддомены (`*.hookahpos.ru`)

Проверка использует exact suffix match: `hostname.endsWith('.' + baseDomain)`.

## Rate Limiting

| Endpoint | Лимит | Ключ |
|----------|-------|------|
| `/api/*` (общий) | 1500 req / 15 мин | `host:IP` |
| `/api/auth/login` | 20 req / 15 мин | `auth:IP` |
| `/api/auth/register` | 20 req / 15 мин | `auth:IP` |
| `/api/auth/pin-login` | 20 req / 15 мин | `auth:IP` |

Ключ для общего лимита включает hostname, чтобы один tenant не блокировал остальных.
