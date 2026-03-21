#!/bin/bash
set -e

# ===== НАСТРОЙКИ: заполнить перед запуском =====
NEW_DOMAIN="newdomain.ru"          # Новый домен (без www)
NEW_DOMAIN_WWW="www.newdomain.ru"  # www-алиас
LETSENCRYPT_EMAIL="admin@newdomain.ru"
PROJECT_NAME="fkposter"

# SSH-доступ к старому серверу (должен работать без пароля — по ключу)
OLD_SERVER="user@1.2.3.4"

# Путь к проекту на СТАРОМ сервере (где лежит docker-compose.yml)
OLD_PROJECT_DIR="/opt/fkposter"

# Имя compose-проекта на старом сервере
OLD_PROJECT_NAME="fkposter"

# Параметры БД на старом сервере (из .env старого сервера)
OLD_DB_CONTAINER="db"      # имя контейнера postgres
OLD_DB_NAME="hookahpos"
OLD_DB_USER="hookahpos"
OLD_DB_PASSWORD=""         # заполнить из .env старого сервера
# ===============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ============== Цвета для вывода ==============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[*]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[x]${NC} $1"; }
info() { echo -e "${BLUE}[i]${NC} $1"; }

# ============== Режим повторной синхронизации ==============
RESYNC_ONLY=false
for arg in "$@"; do
  [[ "$arg" == "--resync-only" ]] && RESYNC_ONLY=true
done

if $RESYNC_ONLY; then
  warn "Режим --resync-only: будут выполнены только шаги синхронизации данных (дамп БД + rsync uploads)."
  read -p "Продолжить? (y/N) " -n 1 -r; echo
  [[ ! $REPLY =~ ^[yY]$ ]] && { err "Отменено."; exit 1; }
fi

# ============== 1. Проверка предусловий ==============
log "Проверка предусловий..."

for cmd in docker ssh scp rsync; do
  if ! command -v $cmd &>/dev/null; then
    err "Не найдена утилита: $cmd. Установите её и запустите снова."
    exit 1
  fi
done

if ! docker compose version &>/dev/null; then
  err "Docker Compose не найден. Установите плагин compose."
  exit 1
fi

log "Проверка SSH-доступа к старому серверу ($OLD_SERVER)..."
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$OLD_SERVER" echo ok &>/dev/null; then
  err "Нет SSH-доступа к $OLD_SERVER. Убедитесь, что SSH-ключ настроен: ssh-copy-id $OLD_SERVER"
  exit 1
fi
log "SSH-доступ подтверждён."

if $RESYNC_ONLY; then
  # ---- Повторная синхронизация: только дамп + rsync ----

  # Дамп БД
  log "Создание дампа БД на старом сервере..."
  if [ -n "$OLD_DB_PASSWORD" ]; then
    ssh "$OLD_SERVER" "docker exec -e PGPASSWORD='$OLD_DB_PASSWORD' ${OLD_PROJECT_NAME}-${OLD_DB_CONTAINER}-1 pg_dump -U $OLD_DB_USER $OLD_DB_NAME 2>/dev/null || docker exec -e PGPASSWORD='$OLD_DB_PASSWORD' $OLD_DB_CONTAINER pg_dump -U $OLD_DB_USER $OLD_DB_NAME | gzip > /tmp/hookahpos_dump.sql.gz"
  else
    ssh "$OLD_SERVER" "docker exec \$(docker ps --format '{{.Names}}' | grep -E '(${OLD_PROJECT_NAME}[_-])?${OLD_DB_CONTAINER}' | head -1) pg_dump -U $OLD_DB_USER $OLD_DB_NAME | gzip > /tmp/hookahpos_dump.sql.gz"
  fi
  log "Скачивание дампа..."
  scp "$OLD_SERVER:/tmp/hookahpos_dump.sql.gz" /tmp/hookahpos_dump.sql.gz
  ssh "$OLD_SERVER" "rm -f /tmp/hookahpos_dump.sql.gz"
  log "Дамп получен: /tmp/hookahpos_dump.sql.gz"

  # rsync uploads
  log "Синхронизация uploads..."
  UPLOADS_SYNCED=false
  for REMOTE_PATH in "$OLD_PROJECT_DIR/uploads" "$OLD_PROJECT_DIR/server/public/uploads"; do
    if ssh "$OLD_SERVER" "[ -d '$REMOTE_PATH' ]" 2>/dev/null; then
      LOCAL_PATH="${REMOTE_PATH##*/uploads}"
      if [ "$REMOTE_PATH" = "$OLD_PROJECT_DIR/uploads" ]; then
        mkdir -p ./uploads
        rsync -avz --progress "$OLD_SERVER:$REMOTE_PATH/" ./uploads/
      else
        mkdir -p ./server/public/uploads
        rsync -avz --progress "$OLD_SERVER:$REMOTE_PATH/" ./server/public/uploads/
      fi
      UPLOADS_SYNCED=true
      break
    fi
  done
  $UPLOADS_SYNCED || warn "Папка uploads не найдена на старом сервере. Пропуск."

  # Восстановление дампа
  log "Восстановление дампа в БД нового сервера..."
  for i in $(seq 1 10); do
    if docker compose -p "$PROJECT_NAME" exec -T db pg_isready -U hookahpos &>/dev/null; then
      break
    fi
    warn "Ожидание postgres ($i/10)..."
    sleep 3
  done

  docker compose -p "$PROJECT_NAME" exec -T db psql -U hookahpos hookahpos -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true
  gunzip -c /tmp/hookahpos_dump.sql.gz | docker compose -p "$PROJECT_NAME" exec -T db psql -U hookahpos hookahpos
  log "Данные восстановлены. Повторная синхронизация завершена."
  exit 0
fi

# ============== 2. Копирование JWT_SECRET со старого сервера ==============
log "Получение JWT_SECRET со старого сервера..."
JWT_SECRET_RAW=$(ssh "$OLD_SERVER" "grep '^JWT_SECRET=' '$OLD_PROJECT_DIR/.env' 2>/dev/null || true")
if [ -z "$JWT_SECRET_RAW" ]; then
  warn "JWT_SECRET не найден в $OLD_PROJECT_DIR/.env на старом сервере."
  warn "Токены существующих пользователей станут невалидными после переключения!"
  read -p "Продолжить с новым JWT_SECRET? (y/N) " -n 1 -r; echo
  [[ ! $REPLY =~ ^[yY]$ ]] && { err "Отменено. Укажите JWT_SECRET вручную в .env."; exit 1; }
  OLD_JWT_SECRET=""
else
  OLD_JWT_SECRET="${JWT_SECRET_RAW#JWT_SECRET=}"
  log "JWT_SECRET получен со старого сервера."
fi

# ============== 3. Создание и скачивание дампа БД ==============
log "Создание дампа БД на старом сервере..."

# Определяем реальное имя контейнера postgres на старом сервере
OLD_DB_ACTUAL=$(ssh "$OLD_SERVER" "docker ps --format '{{.Names}}' | grep -E '(${OLD_PROJECT_NAME}[_-])?${OLD_DB_CONTAINER}' | head -1" 2>/dev/null || echo "")

if [ -z "$OLD_DB_ACTUAL" ]; then
  err "Не удалось найти контейнер '$OLD_DB_CONTAINER' на старом сервере. Проверьте OLD_DB_CONTAINER."
  err "Запущенные контейнеры: $(ssh "$OLD_SERVER" "docker ps --format '{{.Names}}'" 2>/dev/null)"
  exit 1
fi
log "Контейнер БД на старом сервере: $OLD_DB_ACTUAL"

if [ -n "$OLD_DB_PASSWORD" ]; then
  ssh "$OLD_SERVER" "docker exec -e PGPASSWORD='$OLD_DB_PASSWORD' '$OLD_DB_ACTUAL' pg_dump -U '$OLD_DB_USER' '$OLD_DB_NAME' | gzip > /tmp/hookahpos_dump.sql.gz"
else
  ssh "$OLD_SERVER" "docker exec '$OLD_DB_ACTUAL' pg_dump -U '$OLD_DB_USER' '$OLD_DB_NAME' | gzip > /tmp/hookahpos_dump.sql.gz"
fi

log "Скачивание дампа на новый сервер..."
scp "$OLD_SERVER:/tmp/hookahpos_dump.sql.gz" /tmp/hookahpos_dump.sql.gz
ssh "$OLD_SERVER" "rm -f /tmp/hookahpos_dump.sql.gz"
log "Дамп сохранён в /tmp/hookahpos_dump.sql.gz"

# ============== 4. Синхронизация uploads ==============
log "Синхронизация загруженных файлов (uploads)..."
UPLOADS_SYNCED=false

for REMOTE_PATH in "$OLD_PROJECT_DIR/uploads" "$OLD_PROJECT_DIR/server/public/uploads"; do
  if ssh "$OLD_SERVER" "[ -d '$REMOTE_PATH' ]" 2>/dev/null; then
    if [ "$REMOTE_PATH" = "$OLD_PROJECT_DIR/uploads" ]; then
      mkdir -p ./uploads
      rsync -avz --progress "$OLD_SERVER:$REMOTE_PATH/" ./uploads/
      log "Uploads синхронизированы → ./uploads/"
    else
      mkdir -p ./server/public/uploads
      rsync -avz --progress "$OLD_SERVER:$REMOTE_PATH/" ./server/public/uploads/
      log "Uploads синхронизированы → ./server/public/uploads/"
    fi
    UPLOADS_SYNCED=true
    break
  fi
done

$UPLOADS_SYNCED || warn "Папка uploads не найдена на старом сервере (пути проверены: uploads/, server/public/uploads/). Пропуск."

# ============== 5. Настройка .env ==============
if [ ! -f .env ]; then
  log "Создание .env из .env.production.example..."
  cp .env.production.example .env

  DB_PASS=$(openssl rand -base64 24 2>/dev/null | tr -d '\n/+=' | head -c 24)
  sed -i.bak "s|DB_PASSWORD=.*|DB_PASSWORD=$DB_PASS|" .env

  if [ -n "$OLD_JWT_SECRET" ]; then
    sed -i.bak "s|JWT_SECRET=.*|JWT_SECRET=$OLD_JWT_SECRET|" .env
    log "JWT_SECRET из старого сервера вставлен в .env."
  else
    NEW_JWT=$(openssl rand -base64 32 2>/dev/null)
    sed -i.bak "s|JWT_SECRET=.*|JWT_SECRET=$NEW_JWT|" .env
    warn "Сгенерирован новый JWT_SECRET (существующие сессии станут невалидными)."
  fi

  sed -i.bak "s|CORS_ORIGIN=.*|CORS_ORIGIN=https://$NEW_DOMAIN|" .env
  sed -i.bak "s|BASE_DOMAIN=.*|BASE_DOMAIN=$NEW_DOMAIN|" .env
  rm -f .env.bak
  log "Файл .env создан."
else
  log "Файл .env уже существует. Обновляю CORS_ORIGIN и BASE_DOMAIN..."

  if [ -n "$OLD_JWT_SECRET" ]; then
    if grep -q '^JWT_SECRET=' .env; then
      CURRENT_JWT=$(grep '^JWT_SECRET=' .env | cut -d= -f2-)
      if [ "$CURRENT_JWT" != "$OLD_JWT_SECRET" ]; then
        warn "JWT_SECRET в .env отличается от значения на старом сервере."
        read -p "Заменить JWT_SECRET на значение со старого сервера? (y/N) " -n 1 -r; echo
        if [[ $REPLY =~ ^[yY]$ ]]; then
          sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$OLD_JWT_SECRET|" .env
          rm -f .env.bak
          log "JWT_SECRET обновлён."
        fi
      fi
    fi
  fi

  if grep -q '^CORS_ORIGIN=' .env; then
    sed -i.bak "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://$NEW_DOMAIN|" .env
    rm -f .env.bak
  fi
  if grep -q '^BASE_DOMAIN=' .env; then
    sed -i.bak "s|^BASE_DOMAIN=.*|BASE_DOMAIN=$NEW_DOMAIN|" .env
    rm -f .env.bak
  fi
fi

# ============== 6. SSL-сертификаты (Let's Encrypt) ==============
mkdir -p nginx/certs
CERT_PATH="nginx/certs/fullchain.pem"
KEY_PATH="nginx/certs/privkey.pem"

if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
  log "Сертификаты не найдены. Получение через Let's Encrypt (certbot)..."
  if ! command -v certbot &>/dev/null; then
    warn "certbot не установлен. Установите: sudo apt install certbot"
    warn "Без сертификата будет работать только HTTP. Для HTTPS позже выполните:"
    echo "  sudo certbot certonly --standalone -d $NEW_DOMAIN -d $NEW_DOMAIN_WWW -m $LETSENCRYPT_EMAIL"
    echo "  sudo cp /etc/letsencrypt/live/$NEW_DOMAIN/fullchain.pem nginx/certs/"
    echo "  sudo cp /etc/letsencrypt/live/$NEW_DOMAIN/privkey.pem nginx/certs/"
    echo "  sudo chown \$USER:\$USER nginx/certs/*.pem"
  else
    sudo certbot certonly --standalone -d "$NEW_DOMAIN" -d "$NEW_DOMAIN_WWW" \
      --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" \
      --preferred-challenges http || true
    if [ -d "/etc/letsencrypt/live/$NEW_DOMAIN" ]; then
      sudo cp "/etc/letsencrypt/live/$NEW_DOMAIN/fullchain.pem" "$CERT_PATH"
      sudo cp "/etc/letsencrypt/live/$NEW_DOMAIN/privkey.pem" "$KEY_PATH"
      sudo chown "$USER:$(id -gn)" nginx/certs/*.pem 2>/dev/null || sudo chown "$USER:$USER" nginx/certs/*.pem
      log "Сертификаты скопированы в nginx/certs/"
    else
      warn "Не удалось получить сертификат. Будет использован только HTTP."
    fi
  fi
else
  log "Сертификаты уже есть: $CERT_PATH, $KEY_PATH"
fi

# ============== 7. Конфиг Nginx ==============
log "Настройка Nginx для $NEW_DOMAIN..."

if [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; then
  cat > nginx/conf.d/default.conf << 'NGINX_SSL'
upstream app {
    server app:3001;
}

server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER WWW_PLACEHOLDER *.DOMAIN_PLACEHOLDER;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name DOMAIN_PLACEHOLDER WWW_PLACEHOLDER *.DOMAIN_PLACEHOLDER;

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
  sed -i "s/DOMAIN_PLACEHOLDER/$NEW_DOMAIN/g; s/WWW_PLACEHOLDER/$NEW_DOMAIN_WWW/g" nginx/conf.d/default.conf
else
  cat > nginx/conf.d/default.conf << 'NGINX_HTTP'
upstream app {
    server app:3001;
}

server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER WWW_PLACEHOLDER *.DOMAIN_PLACEHOLDER;

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
  sed -i "s/DOMAIN_PLACEHOLDER/$NEW_DOMAIN/g; s/WWW_PLACEHOLDER/$NEW_DOMAIN_WWW/g" nginx/conf.d/default.conf
fi

# ============== 8. Переключение портов docker-compose ==============
if grep -q '8080:80' docker-compose.yml 2>/dev/null; then
  log "Переключаю порты Nginx на 80 и 443..."
  sed -i.bak 's/8080:80/80:80/g; s/8443:443/443:443/g' docker-compose.yml
  rm -f docker-compose.yml.bak
fi

# ============== 9. Запуск контейнера БД ==============
log "Запуск контейнера БД..."
docker compose -p "$PROJECT_NAME" up -d db

log "Ожидание готовности postgres..."
for i in $(seq 1 30); do
  if docker compose -p "$PROJECT_NAME" exec -T db pg_isready -U hookahpos &>/dev/null; then
    log "Postgres готов."
    break
  fi
  if [ "$i" -eq 30 ]; then
    err "Postgres не запустился за 90 секунд. Проверьте: docker compose -p $PROJECT_NAME logs db"
    exit 1
  fi
  warn "Ожидание postgres ($i/30)..."
  sleep 3
done

# ============== 10. Восстановление дампа ==============
log "Восстановление дампа в новую БД..."
docker compose -p "$PROJECT_NAME" exec -T db psql -U hookahpos hookahpos -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true
gunzip -c /tmp/hookahpos_dump.sql.gz | docker compose -p "$PROJECT_NAME" exec -T db psql -U hookahpos hookahpos
log "Дамп восстановлен."

# ============== 11. Запуск остальных сервисов ==============
log "Сборка и запуск всех сервисов ($PROJECT_NAME)..."
docker compose -p "$PROJECT_NAME" up -d --build

# ============== 12. Миграции БД ==============
log "Ожидание готовности приложения и выполнение миграций..."
for i in $(seq 1 10); do
  if docker compose -p "$PROJECT_NAME" exec -T app node migrations/run.js 2>&1; then
    log "Миграции выполнены."
    break
  fi
  if [ "$i" -eq 10 ]; then
    err "Не удалось выполнить миграции после 10 попыток."
    err "Проверьте: docker compose -p $PROJECT_NAME logs app"
    exit 1
  fi
  warn "Миграции не прошли (попытка $i/10), ждём 3 сек..."
  sleep 3
done

# ============== 13. Проверка ==============
log "Проверка работоспособности приложения..."
sleep 5

HEALTH_PROTO="https"
[ ! -f "$CERT_PATH" ] && HEALTH_PROTO="http"

HTTP_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "$HEALTH_PROTO://$NEW_DOMAIN/api/health" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "502" ] || [ "$HTTP_STATUS" = "000" ]; then
  warn "Проверка вернула статус $HTTP_STATUS. Возможно, приложение ещё запускается."
  warn "Проверьте вручную: curl -sk $HEALTH_PROTO://$NEW_DOMAIN/api/health"
else
  log "Приложение отвечает (HTTP $HTTP_STATUS)."
fi

# ============== Итог ==============
echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}  Миграция завершена!${NC}"
echo -e "${GREEN}======================================================${NC}"
echo ""
echo -e "  Сайт:    $HEALTH_PROTO://$NEW_DOMAIN"
echo -e "  Проект:  $PROJECT_NAME"
echo -e "  Логи:    docker compose -p $PROJECT_NAME logs -f"
echo ""
echo -e "${YELLOW}Для переключения DNS:${NC}"
echo ""
echo "  1. В DNS-панели домена $NEW_DOMAIN измените A-запись на IP этого сервера."
echo "     Также добавьте wildcard: *.$NEW_DOMAIN → тот же IP (для субдоменов)."
echo "  2. Дождитесь propagation (обычно 5–30 минут, зависит от TTL)."
echo "  3. Проверьте: $HEALTH_PROTO://$NEW_DOMAIN"
echo "  4. После успешной проверки остановите старый сервер:"
echo "     ssh $OLD_SERVER \"cd $OLD_PROJECT_DIR && docker compose down\""
echo ""
echo -e "${BLUE}Checklist:${NC}"
echo "  docker compose -p $PROJECT_NAME ps"
echo "  curl -sk $HEALTH_PROTO://$NEW_DOMAIN/api/auth/me   # должен вернуть 401, не 502"
echo "  # Войдите под существующим аккаунтом — сессия должна работать (JWT_SECRET тот же)"
echo "  # Проверьте субдомен тенанта: $HEALTH_PROTO://tenant-slug.$NEW_DOMAIN"
echo "  # Убедитесь, что изображения товаров отображаются"
echo ""
echo -e "${YELLOW}Повторная синхронизация перед DNS-переключением:${NC}"
echo "  $0 --resync-only"
echo ""
