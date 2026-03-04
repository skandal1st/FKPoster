# Деплой

## Docker Compose

Рекомендуемый способ деплоя. Четыре сервиса:

```yaml
services:
  db:       # PostgreSQL 16
  redis:    # Redis 7 (Socket.io adapter)
  app:      # Node.js + PM2
  nginx:    # Reverse proxy
```

### Запуск

```bash
# Скопировать переменные окружения
cp .env.example .env
# Отредактировать .env: JWT_SECRET, DB_PASSWORD, BASE_DOMAIN

# Запуск всех сервисов
docker compose up -d

# Запуск миграций
docker compose exec app node migrations/run.js

# Логи
docker compose logs -f app
```

### Переменные окружения

```env
# .env (корень проекта)
DB_PASSWORD=strong-password-here
JWT_SECRET=random-secret-at-least-32-chars
BASE_DOMAIN=hookahpos.ru
CORS_ORIGIN=*
```

### Сервисы

#### db (PostgreSQL 16 Alpine)

- Порт: 5432
- Тюнинг: `max_connections=200`, `shared_buffers=256MB`, `work_mem=4MB`, `effective_cache_size=512MB`
- Volume: `pgdata` (persistent)

#### redis (Redis 7 Alpine)

- Для Socket.io Redis adapter (синхронизация WebSocket между процессами PM2)
- `maxmemory 64mb`, `allkeys-lru`
- Доступен только из внутренней сети Docker

#### app (Node.js)

- Multi-stage build: client → server
- PM2 cluster mode (количество процессов: `PM2_INSTANCES`, по умолчанию `max`)
- Порт: 3001
- `max_memory_restart: 512M`

#### nginx (Alpine)

- Reverse proxy → app:3001
- Wildcard поддомены: `*.hookahpos.ru`
- WebSocket проксирование (`/socket.io/`)
- Gzip: JSON, CSS, JS (min 256 bytes)
- Порты: 8080 (HTTP), 8443 (HTTPS)

## Dockerfile

Multi-stage build:

```dockerfile
# Stage 1: Build React client
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
ARG VITE_BASE_DOMAIN=lvh.me
ENV VITE_BASE_DOMAIN=$VITE_BASE_DOMAIN
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
RUN npm install pm2 -g
COPY server/ ./
COPY --from=client-build /app/client/dist ./public
CMD ["pm2-runtime", "ecosystem.config.js"]
```

`VITE_BASE_DOMAIN` передаётся через `build args` в docker-compose:

```yaml
app:
  build:
    args:
      VITE_BASE_DOMAIN: ${BASE_DOMAIN:-lvh.me}
```

## PM2 (Cluster Mode)

`server/ecosystem.config.js`:

```js
module.exports = {
  apps: [{
    name: 'hookahpos',
    script: 'index.js',
    instances: process.env.PM2_INSTANCES || 'max',
    exec_mode: 'cluster',
    max_memory_restart: '512M',
  }],
};
```

Cluster mode запускает несколько процессов Node.js. Socket.io синхронизируется через Redis adapter.

## Nginx

Конфиг: `nginx/conf.d/default.conf`

```nginx
upstream app {
    server app:3001;
    keepalive 32;
}

server {
    listen 80;
    server_name *.hookahpos.ru hookahpos.ru;

    # Socket.io — WebSocket upgrade
    location /socket.io/ {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 86400s;
    }

    # API и статика
    location / {
        proxy_pass http://app;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering on;
    }
}
```

Ключевые заголовки:
- `X-Forwarded-Host` — для subdomain middleware (определение tenant по Host)
- `X-Real-IP` — для rate limiting по реальному IP
- `X-Forwarded-Proto` — для определения HTTP/HTTPS

## SSL / Let's Encrypt

Для production с HTTPS необходимо:

1. Получить wildcard SSL-сертификат для `*.hookahpos.ru` (Let's Encrypt с DNS challenge)
2. Поместить сертификаты в `nginx/certs/`
3. Обновить nginx конфиг для listen 443 + ssl

```bash
# Пример получения сертификата (certbot + DNS challenge)
certbot certonly --manual --preferred-challenges dns \
  -d hookahpos.ru -d *.hookahpos.ru
```

## Обновление

```bash
# Пересборка и перезапуск
docker compose build app
docker compose up -d app

# Миграции (если есть новые)
docker compose exec app node migrations/run.js
```

## Мониторинг

```bash
# Логи приложения
docker compose logs -f app

# PM2 status внутри контейнера
docker compose exec app pm2 monit

# Состояние PostgreSQL
docker compose exec db psql -U hookahpos -c "SELECT count(*) FROM pg_stat_activity;"
```
