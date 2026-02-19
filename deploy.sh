#!/bin/bash
set -e

# ============== Настройки деплоя ==============
DOMAIN="skanda.ru"
DOMAIN_WWW="www.skanda.ru"
PROJECT_NAME="fkposter"
# Имя старого compose-проекта с этого VPS (оставьте пустым, если не нужно останавливать).
# Узнать имена: docker compose ls  или  docker ps -a --format '{{.Label "com.docker.compose.project"}}'
OLD_PROJECT_NAME=""
# Email для Let's Encrypt (обязательно для получения сертификата)
LETSENCRYPT_EMAIL="admin@skanda.ru"

# Каталог проекта (где лежит docker-compose.yml)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ============== Цвета для вывода ==============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[*]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[x]${NC} $1"; }

# ============== 1. Проверка зависимостей ==============
log "Проверка Docker и Docker Compose..."
if ! command -v docker &>/dev/null; then
  err "Docker не установлен. Установите: curl -fsSL https://get.docker.com | sh"
  exit 1
fi
if ! docker compose version &>/dev/null; then
  err "Docker Compose не найден. Установите плагин compose или docker-compose."
  exit 1
fi

# ============== 2. Остановка старых контейнеров ==============
log "Проверка и остановка старых контейнеров..."

# Остановить наш проект (чтобы освободить порты перед certbot)
docker compose -p "$PROJECT_NAME" down 2>/dev/null || true

# Остановить старый тестовый проект, если указан
if [ -n "$OLD_PROJECT_NAME" ]; then
  log "Останавливаем старый проект: $OLD_PROJECT_NAME"
  docker compose -p "$OLD_PROJECT_NAME" down 2>/dev/null || true
fi

# Удалить «осиротевшие» контейнеры (оставшиеся от старых compose)
log "Удаление остановленных контейнеров..."
docker container prune -f

# Показать, что ещё запущено (на портах 80/443)
if command -v ss &>/dev/null; then
  if ss -tlnp 2>/dev/null | grep -qE ':80 |:443 '; then
    warn "Порты 80 или 443 всё ещё заняты:"
    ss -tlnp 2>/dev/null | grep -E ':80 |:443 ' || true
    read -p "Продолжить всё равно? (y/N) " -n 1 -r; echo
    if [[ ! $REPLY =~ ^[yY]$ ]]; then
      err "Завершение. Освободите порты 80/443 и запустите скрипт снова."
      exit 1
    fi
  fi
fi

# ============== 3. Файл .env ==============
if [ ! -f .env ]; then
  log "Создание .env из .env.production.example..."
  cp .env.production.example .env
  # Генерируем безопасные значения
  SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
  DB_PASS=$(openssl rand -base64 24 2>/dev/null || head -c 24 /dev/urandom | base64 | tr -d '\n/+=' | head -c 24)
  sed -i.bak "s|DB_PASSWORD=.*|DB_PASSWORD=$DB_PASS|" .env
  sed -i.bak "s|JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env
  sed -i.bak "s|CORS_ORIGIN=.*|CORS_ORIGIN=https://$DOMAIN|" .env
  rm -f .env.bak
  log "Создан .env с сгенерированными DB_PASSWORD и JWT_SECRET."
else
  log "Файл .env уже есть. Обновляю CORS_ORIGIN для $DOMAIN..."
  if grep -q '^CORS_ORIGIN=' .env; then
    sed -i.bak "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://$DOMAIN|" .env
    rm -f .env.bak
  fi
fi

# ============== 4. SSL-сертификаты (Let's Encrypt) ==============
mkdir -p nginx/certs
CERT_PATH="nginx/certs/fullchain.pem"
KEY_PATH="nginx/certs/privkey.pem"

if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
  log "Сертификаты не найдены. Получение через Let's Encrypt (certbot)..."
  if ! command -v certbot &>/dev/null; then
    warn "certbot не установлен. Установите: sudo apt install certbot (или certbot certbot)"
    warn "Без сертификата будет работать только HTTP. Для HTTPS позже выполните:"
    echo "  sudo certbot certonly --standalone -d $DOMAIN -d $DOMAIN_WWW -m $LETSENCRYPT_EMAIL"
    echo "  sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/certs/"
    echo "  sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem nginx/certs/"
    echo "  sudo chown \$USER:\$USER nginx/certs/*.pem"
  else
    sudo certbot certonly --standalone -d "$DOMAIN" -d "$DOMAIN_WWW" \
      --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" \
      --preferred-challenges http || true
    if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
      sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_PATH"
      sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$KEY_PATH"
      sudo chown "$USER:$(id -gn)" nginx/certs/*.pem 2>/dev/null || sudo chown "$USER:$USER" nginx/certs/*.pem
      log "Сертификаты скопированы в nginx/certs/"
    else
      warn "Не удалось получить сертификат. Будет использован только HTTP."
    fi
  fi
else
  log "Сертификаты уже есть: $CERT_PATH, $KEY_PATH"
fi

# ============== 5. Конфиг Nginx для домена ==============
log "Настройка Nginx для $DOMAIN..."

if [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; then
  cat > nginx/conf.d/default.conf << 'NGINX_SSL'
upstream app {
    server app:3001;
}

server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER WWW_PLACEHOLDER;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name DOMAIN_PLACEHOLDER WWW_PLACEHOLDER;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    client_max_body_size 10M;

    location / {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_SSL
  sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g; s/WWW_PLACEHOLDER/$DOMAIN_WWW/g" nginx/conf.d/default.conf
else
  cat > nginx/conf.d/default.conf << 'NGINX_HTTP'
upstream app {
    server app:3001;
}

server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER WWW_PLACEHOLDER;

    client_max_body_size 10M;

    location / {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_HTTP
  sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g; s/WWW_PLACEHOLDER/$DOMAIN_WWW/g" nginx/conf.d/default.conf
fi

# ============== 6. Порты 80/443 в docker-compose ==============
# Для продакшена используем 80 и 443 (скрипт подменяет при деплое)
if grep -q '8080:80' docker-compose.yml 2>/dev/null; then
  log "Переключаю порты Nginx на 80 и 443..."
  sed -i.bak 's/8080:80/80:80/g; s/8443:443/443:443/g' docker-compose.yml
  rm -f docker-compose.yml.bak
fi

# ============== 7. Запуск проекта ==============
export COMPOSE_PROJECT_NAME="$PROJECT_NAME"
log "Сборка и запуск контейнеров ($PROJECT_NAME)..."
docker compose up -d --build

# ============== 8. Миграции БД ==============
log "Ожидание готовности БД..."
sleep 5
if docker compose -p "$PROJECT_NAME" exec -T app node migrations/run.js 2>/dev/null; then
  log "Миграции выполнены."
else
  warn "Миграции уже применены или ошибка (проверьте логи: docker compose logs app)."
fi

# ============== Готово ==============
log "Деплой завершён."
echo ""
echo "  Сайт:    https://$DOMAIN"
echo "  Проект:  $PROJECT_NAME"
echo "  Логи:    docker compose -p $PROJECT_NAME logs -f"
echo ""
