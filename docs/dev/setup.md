# Запуск и разработка

## Требования

- **Node.js** 20+
- **PostgreSQL** 16+
- **Redis** 7+ (опционально, для Socket.io кластера)
- **npm** 9+

## Установка

```bash
# Клонировать репозиторий
git clone <repo-url>
cd fkgposters

# Установить все зависимости (root + server + client)
npm run install:all
```

## Переменные окружения

### Сервер (`server/.env`)

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgres://hookahpos:hookahpos@localhost:5432/hookahpos
JWT_SECRET=hookahpos-dev-secret-do-not-use-in-production
CORS_ORIGIN=http://localhost:5173
BASE_DOMAIN=lvh.me
```

| Переменная | Описание | По умолчанию |
|-----------|----------|--------------|
| `PORT` | Порт сервера | `3001` |
| `NODE_ENV` | Окружение | `development` |
| `DATABASE_URL` | Строка подключения к PostgreSQL | `postgres://hookahpos:hookahpos@localhost:5432/hookahpos` |
| `JWT_SECRET` | Секрет для подписи JWT (обязателен в production) | dev-заглушка |
| `CORS_ORIGIN` | Разрешённый origin (не используется — CORS динамический) | `http://localhost:5173` |
| `BASE_DOMAIN` | Базовый домен для поддоменов | `lvh.me` |
| `PG_POOL_MAX` | Максимум соединений в пуле | `20` |
| `REDIS_URL` | URL Redis для Socket.io adapter | (нет, in-memory) |

### Клиент (`client/.env`)

```env
VITE_BASE_DOMAIN=lvh.me
```

`VITE_BASE_DOMAIN` должен совпадать с `BASE_DOMAIN` сервера.

## Создание базы данных

```bash
# Создать БД и пользователя (psql)
psql -U postgres
CREATE USER hookahpos WITH PASSWORD 'hookahpos';
CREATE DATABASE hookahpos OWNER hookahpos;
\q
```

## Миграции

```bash
cd server
npm run migrate
# или напрямую:
node migrations/run.js
```

Миграции идемпотентны — можно запускать повторно без ошибок.

## Запуск в dev-режиме

```bash
# Из корня проекта — запускает и сервер, и клиент одновременно
npm run dev
```

Или по отдельности:

```bash
# Сервер (port 3001, nodemon — авторестарт при изменениях)
cd server && npm run dev

# Клиент (port 5173, Vite dev server с HMR)
cd client && npm run dev
```

После запуска:
- **Главный домен**: http://lvh.me:5173 — регистрация, login
- **Поддомен**: http://my-bar.lvh.me:5173 — POS заведения

## Поддомены в dev-режиме

`lvh.me` — специальный домен, который резолвится в `127.0.0.1` и поддерживает любые поддомены (не требует настройки `/etc/hosts`).

Vite dev-сервер проксирует:
- `/api/*` → `http://localhost:3001` (с заголовком `X-Forwarded-Host` для subdomain middleware)
- `/socket.io/*` → `http://localhost:3001` (с WebSocket upgrade)

```js
// vite.config.js
proxy: {
  '/api': {
    target: 'http://localhost:3001',
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        proxyReq.setHeader('X-Forwarded-Host', req.headers.host || '');
      });
    },
  },
  '/socket.io': {
    target: 'http://localhost:3001',
    ws: true,
  },
}
```

## Сборка клиента

```bash
cd client
npm run build
```

Результат: `client/dist/` — статические файлы для production.

## Утилиты

```bash
# Захешировать пароль (для ручного создания пользователей)
cd server && npm run hash-password
```

## Скрипты (root package.json)

| Скрипт | Описание |
|--------|----------|
| `npm run dev` | Запуск server + client (concurrently) |
| `npm run install:all` | Установка зависимостей всех подпроектов |

## Скрипты (server/package.json)

| Скрипт | Описание |
|--------|----------|
| `npm run dev` | Запуск с nodemon |
| `npm start` | Запуск без nodemon |
| `npm run migrate` | Запуск миграций |
| `npm run hash-password` | Утилита хеширования пароля |

## Скрипты (client/package.json)

| Скрипт | Описание |
|--------|----------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
