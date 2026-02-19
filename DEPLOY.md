# Инструкция по деплою FKPoster на продакшен-сервер

Проект разворачивается через **Docker Compose**: приложение (Node.js + React), PostgreSQL и Nginx.

---

## 1. Требования к серверу

- **ОС:** Linux (Ubuntu 22.04 / Debian 12 или аналог)
- **Docker** и **Docker Compose**
- Открытые порты: **80** (HTTP), при необходимости **443** (HTTPS)

Установка Docker (если ещё не установлен):

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# выйти из SSH и зайти снова, чтобы применилась группа
```

---

## 2. Быстрый деплой скриптом (рекомендуется для VPS)

В репозитории есть скрипт **`deploy.sh`**, который автоматизирует деплой для домена **skanda.ru**: останавливает старые контейнеры, создаёт `.env`, настраивает Nginx, при наличии certbot получает SSL и запускает проект.

**Перед первым запуском:**

1. Клонируйте репозиторий и перейдите в каталог:
   ```bash
   git clone https://github.com/skandal1st/FKPoster.git
   cd FKPoster
   ```

2. В начале `deploy.sh` при необходимости задайте:
   - **`OLD_PROJECT_NAME`** — имя старого compose-проекта с этого VPS (чтобы скрипт его остановил и удалил). Узнать имена: `docker compose ls` или `docker ps -a --format '{{.Label "com.docker.compose.project"}}'`.
   - **`LETSENCRYPT_EMAIL`** — email для Let's Encrypt (по умолчанию `admin@skanda.ru`).

3. Установите certbot для HTTPS (опционально, но рекомендуется):
   ```bash
   sudo apt install certbot
   ```

4. Запустите деплой:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

Скрипт по шагам: останавливает текущий и старый проект → удаляет остановленные контейнеры → создаёт/обновляет `.env` с доменом skanda.ru и сгенерированными секретами → при наличии certbot получает сертификаты для skanda.ru и www.skanda.ru → пишет конфиг Nginx (HTTP или HTTPS) → переключает порты на 80/443 → поднимает контейнеры и запускает миграции.

Для другого домена отредактируйте в начале скрипта переменные `DOMAIN` и `DOMAIN_WWW`.

---

## 3. Подготовка на сервере (ручной деплой)

### 3.1. Клонирование репозитория

```bash
cd /opt  # или другая директория
sudo git clone https://github.com/skandal1st/FKPoster.git
cd FKPoster
```

### 3.2. Файл переменных окружения

Создайте файл `.env` в корне проекта (рядом с `docker-compose.yml`):

```bash
cp .env.production.example .env
nano .env
```

Заполните **обязательные** значения:

| Переменная    | Описание |
|---------------|----------|
| `DB_PASSWORD` | Надёжный пароль для пользователя PostgreSQL |
| `JWT_SECRET`  | Случайная длинная строка для подписи JWT (например: `openssl rand -base64 32`) |
| `CORS_ORIGIN` | URL фронта в продакшене, например `https://yourdomain.com` или `https://poster.yourdomain.com` |

Пример `.env`:

```env
DB_PASSWORD=очень_сложный_пароль_для_бд
JWT_SECRET=ваша_случайная_строка_от_openssl_rand
CORS_ORIGIN=https://poster.yourdomain.com
```

Сохраните файл и проверьте, что он не попадёт в git (он уже в `.gitignore`).

---

## 4. Запуск

### 4.1. Сборка и запуск контейнеров

```bash
docker compose up -d --build
```

Проверка статуса:

```bash
docker compose ps
```

Должны быть в состоянии **Up**: `db`, `app`, `nginx`.

**Если порт 80 уже занят** (ошибка `Bind for 0.0.0.0:80 failed: port is already allocated`):

- Узнать, кто занял порт:
  - Linux: `sudo ss -tlnp | grep :80` или `sudo lsof -i :80`
  - Остановить мешающий сервис (например системный nginx/apache): `sudo systemctl stop nginx`
- Либо использовать другие порты: в `docker-compose.yml` у сервиса `nginx` заменить `ports` на:
  ```yaml
  ports:
    - "8080:80"
    - "8443:443"
  ```
  Тогда приложение будет доступно по адресу `http://IP:8080` (и `https://IP:8443` при настройке SSL).

### 4.2. Миграции БД (один раз после первого запуска)

После первого деплоя нужно применить миграции:

```bash
docker compose exec app node migrations/run.js
```

В логах должно появиться: `All migrations complete`.

### 4.3. Проверка

- Сайт по HTTP: `http://IP_СЕРВЕРА` или `http://yourdomain.com`
- API: `http://IP_СЕРВЕРА/api/...` (например проверка здоровья через любой публичный эндпоинт)

Логи приложения:

```bash
docker compose logs -f app
```

Логи Nginx:

```bash
docker compose logs -f nginx
```

---

## 5. HTTPS (рекомендуется для продакшена)

### Вариант A: Let's Encrypt (Certbot) вручную

1. Установите certbot и получите сертификаты для вашего домена (на хосте, не в контейнере):

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d poster.yourdomain.com
```

2. Создайте папку для сертификатов и скопируйте их:

```bash
mkdir -p nginx/certs
sudo cp /etc/letsencrypt/live/poster.yourdomain.com/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/poster.yourdomain.com/privkey.pem nginx/certs/
sudo chown -R $USER:$USER nginx/certs
```

3. Добавьте в `nginx/conf.d/default.conf` сервер с SSL (см. раздел ниже) и перезапустите nginx:

```bash
docker compose restart nginx
```

4. Обновите в `.env`: `CORS_ORIGIN=https://poster.yourdomain.com`.

### Вариант B: Готовый конфиг Nginx с SSL

Создайте или замените `nginx/conf.d/default.conf` на конфиг с двумя блоками `server`: один для редиректа HTTP → HTTPS, второй для HTTPS. Пример:

```nginx
upstream app {
    server app:3001;
}

server {
    listen 80;
    server_name poster.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name poster.yourdomain.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

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
```

Положите сертификаты в `nginx/certs/` и перезапустите: `docker compose restart nginx`.

---

## 6. Обновление приложения

После изменений в коде на сервере:

```bash
cd /opt/FKPoster
git pull
docker compose up -d --build
```

Если добавлялись новые миграции:

```bash
docker compose exec app node migrations/run.js
```

---

## 7. Полезные команды

| Действие              | Команда |
|-----------------------|--------|
| Остановить всё        | `docker compose down` |
| Остановить и удалить данные БД | `docker compose down -v` |
| Логи приложения       | `docker compose logs -f app` |
| Логи БД               | `docker compose logs -f db` |
| Зайти в контейнер app | `docker compose exec app sh` |
| Подключиться к PostgreSQL | `docker compose exec db psql -U hookahpos -d hookahpos` |

---

## 8. Порты и архитектура

- **80 / 443** — Nginx (принимает запросы, отдаёт статику и проксирует API на приложение).
- **3001** — приложение (внутри сети Docker, снаружи не обязательно открывать).
- **5432** — PostgreSQL (доступен только внутри Docker; при необходимости можно не публиковать порт наружу).

Схема: **Пользователь → Nginx (80/443) → app (3001)**; **app** подключается к **db (5432)**.

---

## 9. Подробно про Nginx

### 9.1. Зачем нужен Nginx

В этом проекте Nginx работает как **обратный прокси (reverse proxy)**:

1. **Единственная точка входа** — снаружи открыты только порты 80/443. Приложение (Node.js) слушает порт 3001 только внутри Docker-сети, его не нужно выставлять в интернет.
2. **Терминация SSL** — при HTTPS Nginx принимает шифрованное соединение и расшифровывает его; до приложения запрос идёт уже по HTTP (внутри сети).
3. **Проксирование запросов** — все запросы к сайту и к `/api/*` Nginx передаёт на контейнер `app:3001`; Node отдаёт и HTML (React), и API.
4. **Ограничение размера тела запроса** — `client_max_body_size 10M` задаётся в Nginx, чтобы не слать в приложение слишком большие запросы.

Без Nginx пришлось бы открывать порт 3001 наружу и настраивать SSL в самом Node.js.

### 9.2. Как устроен конфиг (`nginx/conf.d/default.conf`)

Файл на хосте: `nginx/conf.d/default.conf`. В контейнере монтируется вся папка `./nginx/conf.d` в `/etc/nginx/conf.d` (см. `docker-compose.yml` → `volumes`).

**Блок `upstream`:**

```nginx
upstream app {
    server app:3001;
}
```

- Имя `app` — это имя сервиса из Docker Compose (сеть контейнеров разрешает имя `app` в адрес контейнера).
- `app:3001` — хост и порт, на которых слушает Node.js.
- При необходимости сюда можно добавить несколько `server` для балансировки; для одного инстанса достаточно одной строки.

**Блок `server` (HTTP на порту 80):**

| Директива | Значение | Назначение |
|-----------|----------|------------|
| `listen 80` | Порт 80 | Nginx слушает входящий HTTP на 80. |
| `server_name _` | Любой хост | `_` — «любое имя»; подойдёт и IP, и домен. Для одного приложения этого достаточно. |
| `client_max_body_size 10M` | 10 МБ | Максимальный размер тела запроса (важно для загрузки файлов и больших JSON). |
| `location /` | Все пути | Все запросы (и `/`, и `/api/...`, и статика) обрабатываются этим блоком. |

**Внутри `location /` — проксирование на приложение:**

| Директива | Назначение |
|-----------|------------|
| `proxy_pass http://app` | Передать запрос на upstream с именем `app` (т.е. на `app:3001`). |
| `proxy_http_version 1.1` | Использовать HTTP/1.1 при разговоре с бэкендом (нужно для WebSocket и части заголовков). |
| `proxy_set_header Upgrade $http_upgrade` | Проброс заголовка Upgrade (для возможного WebSocket). |
| `proxy_set_header Connection 'upgrade'` | Сопровождает Upgrade при переключении на WebSocket. |
| `proxy_set_header Host $host` | Передать исходный Host (домен/IP, к которому обратился клиент). |
| `proxy_set_header X-Real-IP $remote_addr` | IP клиента для логов и ограничений в приложении. |
| `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` | Цепочка прокси (если перед Nginx есть ещё прокси/балансировщик). |
| `proxy_set_header X-Forwarded-Proto $scheme` | Схема запроса: `http` или `https`. Важно, чтобы приложение знало, что изначально был HTTPS (редиректы, cookies, CORS). |
| `proxy_cache_bypass $http_upgrade` | Не кэшировать ответы при запросах с Upgrade (WebSocket). |

Итог: весь трафик с порта 80 уходит на Node.js; статику и API отдаёт уже приложение.

### 9.3. HTTPS: что добавить в конфиг

Для продакшена обычно делают два блока `server`:

1. **Порт 80** — редирект на HTTPS (или только выдача сертификата для Let's Encrypt, если используете HTTP-челлендж).
2. **Порт 443** — приём HTTPS, те же `proxy_set_header` и `proxy_pass` на `app`.

Пример (подставьте свой домен и пути к сертификатам):

```nginx
upstream app {
    server app:3001;
}

# Редирект HTTP → HTTPS
server {
    listen 80;
    server_name poster.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl;
    server_name poster.yourdomain.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # Рекомендуемые настройки SSL (современные протоколы и шифры)
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
```

В `docker-compose.yml` для nginx уже смонтирована папка сертификатов:

```yaml
volumes:
  - ./nginx/conf.d:/etc/nginx/conf.d
  - ./nginx/certs:/etc/nginx/certs
```

Файлы `fullchain.pem` и `privkey.pem` нужно положить в `nginx/certs/` на хосте — тогда внутри контейнера они будут доступны как `/etc/nginx/certs/...`.

### 9.4. Проверка конфига и перезагрузка

- Проверить синтаксис конфига (внутри контейнера):
  ```bash
  docker compose exec nginx nginx -t
  ```
- После правки конфига перезагрузить Nginx без даунтайма:
  ```bash
  docker compose exec nginx nginx -s reload
  ```
  или перезапустить контейнер:
  ```bash
  docker compose restart nginx
  ```

### 9.5. Логи Nginx

- Логи по умолчанию идут в stdout/stderr контейнера, их смотреть так:
  ```bash
  docker compose logs -f nginx
  ```
- При необходимости можно вывести access/error логи в файлы, смонтировав каталог и прописав в конфиге, например:
  ```nginx
  access_log /var/log/nginx/access.log;
  error_log  /var/log/nginx/error.log;
  ```
  и в `docker-compose.yml` добавить volume для `/var/log/nginx`.

### 9.6. Частые проблемы

| Ситуация | Что проверить |
|----------|----------------|
| 502 Bad Gateway | Приложение не слушает 3001 или падает. Смотреть `docker compose logs app`, что контейнер `app` запущен. |
| 413 Request Entity Too Large | Увеличить `client_max_body_size` в конфиге Nginx (например до `20M`). |
| После HTTPS редиректы идут на `http://` | В приложении должен учитываться заголовок `X-Forwarded-Proto`; в нашем конфиге он передаётся. Убедиться, что `CORS_ORIGIN` в `.env` — с `https://`. |
| Изменения в конфиге не применяются | Перезагрузить Nginx (`nginx -s reload` или `docker compose restart nginx`). Убедиться, что правится файл, смонтированный в контейнер (тот же, что в `volumes`). |

---

## 10. Бэкап БД

Рекомендуется настроить регулярный дамп PostgreSQL:

```bash
docker compose exec db pg_dump -U hookahpos hookahpos > backup_$(date +%Y%m%d_%H%M).sql
```

Восстановление:

```bash
cat backup_YYYYMMDD_HHMM.sql | docker compose exec -T db psql -U hookahpos hookahpos
```

---

При возникновении ошибок смотрите логи: `docker compose logs -f app` и `docker compose logs -f nginx`.
