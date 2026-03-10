# План реализации локального агента HookahPOS

## Архитектура решения

Локальный агент — универсальное приложение, устанавливаемое на компьютер клиента. Обеспечивает взаимодействие с локальным оборудованием и сервисами, недоступными напрямую из браузера (SaaS).

### Модули агента

| Модуль | Назначение | Локальный сервис | Фаза |
|--------|-----------|-----------------|------|
| **ЕГАИС** | Работа с УТМ (накладные, списания, остатки) | УТМ ФСРАР `:8080` | Phase 1-3 |
| **ККТ** | Печать фискальных чеков на физическом ФР | ATOL DTO / WebServer `:16732` | Phase 4 |

### Компоненты

```
┌───────────────────────────────────────────────┐
│  Локальная сеть клиента (за NAT)              │
│                                               │
│  ┌──────────┐  ┌──────────────┐  ┌────────┐  │
│  │   УТМ    │  │  ATOL DTO /  │  │ Агент  │  │
│  │ ФСРАР    │◄►│  WebServer   │◄►│HookahPOS│  │
│  │ :8080    │  │  :16732      │  │        │  │
│  └──────────┘  └──────────────┘  └───┬────┘  │
│                                      │       │
└──────────────────────────────────────┼───────┘
                                       │ WebSocket
                                       ▼
                          ┌─────────────────────┐
                          │   VPS (облако)       │
                          │  ┌──────────────┐    │
                          │  │ HookahPOS    │    │
                          │  │ Server       │    │
                          │  └──────────────┘    │
                          │  ┌──────────────┐    │
                          │  │ PostgreSQL   │    │
                          │  │ + stamps     │    │
                          │  └──────────────┘    │
                          └─────────────────────┘
                                       ▲
                                       │ HTTPS
                                       │
                          ┌─────────────────────┐
                          │   Браузер (POS)      │
                          │  Кассир/Менеджер     │
                          └─────────────────────┘
```

### Почему через агента, а не напрямую из браузера?

| Проблема (браузер → localhost) | Решение (через агента) |
|---|---|
| CORS / mixed content (HTTPS → HTTP) | Агент общается с оборудованием напрямую |
| Настройка безопасности браузера | Не нужна |
| Браузер должен знать порт драйвера | Агент знает из конфига |
| Нет фидбека если драйвер/УТМ не запущен | Агент мониторит и сообщает статус в облако |
| Два отдельных локальных приложения | Один агент для всего локального оборудования |

### Workflow сканирования марок

**Приемка (1 раз в неделю, не на кассе)**
- Менеджер сканирует все бутылки сканером штрихкодов
- Марки сохраняются в БД со статусом `available`
- Отправка накладной в ЕГАИС через УТМ

**Продажа (на кассе, быстро)**
- Кассир НЕ сканирует бутылки
- Добавляет товар в заказ как обычно
- Система автоматически списывает марку по FIFO
- Агент отправляет списание в ЕГАИС

---

## Этап 1: База данных и миграции

### 1.1 Миграция: таблица акцизных марок

**Файл**: `server/migrations/012_egais_integration.js`

```javascript
exports.up = async (db) => {
  // Таблица для хранения акцизных марок
  await db.run(`
    CREATE TABLE IF NOT EXISTS excise_stamps (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),

      -- Акцизная марка
      stamp_code VARCHAR(150) UNIQUE NOT NULL,

      -- ЕГАИС данные
      alc_code VARCHAR(19),              -- код алкогольной продукции
      capacity NUMERIC(10,3),            -- объем в литрах
      alcohol_percent NUMERIC(4,2),      -- крепость %

      -- Документы прихода
      waybill_id INTEGER,                -- ID накладной в нашей БД
      waybill_number VARCHAR(50),        -- номер ТТН
      waybill_egais_id VARCHAR(50),      -- ID документа в ЕГАИС

      -- Статус жизненного цикла
      status VARCHAR(20) DEFAULT 'available'
        CHECK (status IN ('available', 'reserved', 'sold', 'written_off', 'lost')),

      -- Данные продажи
      sold_order_id INTEGER REFERENCES orders(id),
      sold_at TIMESTAMPTZ,
      sale_egais_id VARCHAR(50),         -- ID документа списания в ЕГАИС

      -- Метаданные
      received_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Индексы для производительности
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_stamps_tenant_product
    ON excise_stamps(tenant_id, product_id)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_stamps_status
    ON excise_stamps(tenant_id, status)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_stamps_code
    ON excise_stamps(stamp_code)
  `);

  // Расширение таблицы products для ЕГАИС
  await db.run(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS requires_excise_stamp BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_alcohol BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS alcohol_percent NUMERIC(4,2),
    ADD COLUMN IF NOT EXISTS alc_code VARCHAR(19)
  `);

  // Таблица накладных ЕГАИС
  await db.run(`
    CREATE TABLE IF NOT EXISTS egais_waybills (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

      -- Номера документов
      number VARCHAR(50) NOT NULL,       -- наш внутренний номер
      egais_id VARCHAR(50),              -- ID в ЕГАИС (после подтверждения)

      -- Данные поставщика
      supplier_name VARCHAR(255),
      supplier_inn VARCHAR(12),

      -- Статус обработки
      status VARCHAR(20) DEFAULT 'draft'
        CHECK (status IN ('draft', 'scanning', 'pending', 'sent', 'accepted', 'rejected')),

      -- Статистика сканирования
      total_positions INTEGER DEFAULT 0,      -- всего позиций
      scanned_positions INTEGER DEFAULT 0,    -- отсканировано позиций
      total_bottles INTEGER DEFAULT 0,        -- всего бутылок
      scanned_bottles INTEGER DEFAULT 0,      -- отсканировано бутылок

      -- Даты
      document_date DATE,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      accepted_at TIMESTAMPTZ,

      -- Метаданные
      notes TEXT
    )
  `);

  // Позиции накладной
  await db.run(`
    CREATE TABLE IF NOT EXISTS egais_waybill_items (
      id SERIAL PRIMARY KEY,
      waybill_id INTEGER NOT NULL REFERENCES egais_waybills(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),

      -- Количество
      quantity INTEGER NOT NULL,
      scanned_quantity INTEGER DEFAULT 0,

      -- Цена
      price NUMERIC(12,2),

      -- Статус сканирования
      is_complete BOOLEAN DEFAULT false,

      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Таблица для настроек ЕГАИС агента
  await db.run(`
    CREATE TABLE IF NOT EXISTS egais_agents (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,

      -- Токен для аутентификации агента
      api_key VARCHAR(64) UNIQUE NOT NULL,

      -- Статус подключения
      is_online BOOLEAN DEFAULT false,
      last_ping_at TIMESTAMPTZ,

      -- Версия агента
      agent_version VARCHAR(20),

      -- Настройки УТМ (хранятся на стороне агента, здесь только для справки)
      utm_url VARCHAR(255) DEFAULT 'http://localhost:8080',

      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Очередь документов для отправки в ЕГАИС
  await db.run(`
    CREATE TABLE IF NOT EXISTS egais_queue (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

      -- Тип операции
      operation_type VARCHAR(50) NOT NULL
        CHECK (operation_type IN ('waybill', 'sale', 'writeoff', 'inventory')),

      -- Ссылка на документ
      reference_id INTEGER,              -- ID заказа/накладной
      reference_type VARCHAR(50),        -- orders/waybills

      -- Данные для отправки (JSON)
      payload JSONB NOT NULL,

      -- Статус обработки
      status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'sent', 'completed', 'failed')),

      -- Результат
      egais_response JSONB,
      egais_document_id VARCHAR(50),
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,

      -- Даты
      created_at TIMESTAMPTZ DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    )
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_queue_status
    ON egais_queue(tenant_id, status)
  `);
};
```

**Запустить миграцию**:
```bash
cd server && npm run migrate
```

---

## Этап 2: Серверный API

### 2.1 ЕГАИС Routes

**Файл**: `server/routes/egais.js`

```javascript
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

// ============= АГЕНТЫ =============

// Регистрация ЕГАИС агента (вызывается при установке агента)
router.post('/agents/register', authMiddleware, adminOnly, tenantMiddleware, async (req, res) => {
  try {
    const apiKey = require('crypto').randomBytes(32).toString('hex');

    await db.run(`
      INSERT INTO egais_agents (tenant_id, api_key)
      VALUES ($1, $2)
      ON CONFLICT (tenant_id) DO UPDATE
      SET api_key = $2, updated_at = NOW()
    `, [req.tenantId, apiKey]);

    res.json({ apiKey });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Получить статус агента
router.get('/agents/status', authMiddleware, tenantMiddleware, async (req, res) => {
  try {
    const agent = await db.get(
      'SELECT * FROM egais_agents WHERE tenant_id = $1',
      [req.tenantId]
    );

    res.json({
      isConfigured: !!agent,
      isOnline: agent?.is_online || false,
      lastPing: agent?.last_ping_at,
      version: agent?.agent_version
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ping от агента (WebSocket heartbeat)
router.post('/agents/ping', async (req, res) => {
  const { apiKey, version } = req.body;

  try {
    await db.run(`
      UPDATE egais_agents
      SET is_online = true,
          last_ping_at = NOW(),
          agent_version = $1
      WHERE api_key = $2
    `, [version, apiKey]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= НАКЛАДНЫЕ =============

// Создать новую накладную
router.post('/waybills', authMiddleware, adminOnly, tenantMiddleware, async (req, res) => {
  const { number, supplierName, supplierInn, documentDate, items } = req.body;

  try {
    const result = await db.transaction(async (client) => {
      // Создать накладную
      const waybill = await client.get(`
        INSERT INTO egais_waybills
        (tenant_id, number, supplier_name, supplier_inn, document_date,
         created_by, total_positions, total_bottles, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
        RETURNING *
      `, [
        req.tenantId, number, supplierName, supplierInn, documentDate,
        req.user.id, items.length,
        items.reduce((sum, i) => sum + i.quantity, 0)
      ]);

      // Добавить позиции
      for (const item of items) {
        await client.run(`
          INSERT INTO egais_waybill_items
          (waybill_id, product_id, quantity, price)
          VALUES ($1, $2, $3, $4)
        `, [waybill.id, item.productId, item.quantity, item.price]);
      }

      return waybill;
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Получить накладную для сканирования
router.get('/waybills/:id', authMiddleware, tenantMiddleware, async (req, res) => {
  try {
    const waybill = await db.get(`
      SELECT * FROM egais_waybills
      WHERE id = $1 AND tenant_id = $2
    `, [req.params.id, req.tenantId]);

    if (!waybill) {
      return res.status(404).json({ error: 'Накладная не найдена' });
    }

    const items = await db.all(`
      SELECT wi.*, p.name as product_name, p.alc_code
      FROM egais_waybill_items wi
      JOIN products p ON wi.product_id = p.id
      WHERE wi.waybill_id = $1
    `, [req.params.id]);

    res.json({ ...waybill, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Сканировать акцизную марку
router.post('/waybills/:id/scan-stamp', authMiddleware, tenantMiddleware, async (req, res) => {
  const { stampCode, productId } = req.body;

  try {
    const result = await db.transaction(async (client) => {
      // Проверить, что марка еще не отсканирована
      const existing = await client.get(
        'SELECT id FROM excise_stamps WHERE stamp_code = $1',
        [stampCode]
      );

      if (existing) {
        throw new Error('Эта марка уже отсканирована ранее');
      }

      // Получить товар
      const product = await client.get(
        'SELECT * FROM products WHERE id = $1 AND tenant_id = $2',
        [productId, req.tenantId]
      );

      if (!product) {
        throw new Error('Товар не найден');
      }

      // Сохранить марку
      await client.run(`
        INSERT INTO excise_stamps
        (tenant_id, product_id, stamp_code, waybill_id, alc_code,
         alcohol_percent, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'available')
      `, [
        req.tenantId, productId, stampCode, req.params.id,
        product.alc_code, product.alcohol_percent
      ]);

      // Обновить счетчик в позиции накладной
      await client.run(`
        UPDATE egais_waybill_items
        SET scanned_quantity = scanned_quantity + 1,
            is_complete = (scanned_quantity + 1 >= quantity)
        WHERE waybill_id = $1 AND product_id = $2
      `, [req.params.id, productId]);

      // Обновить счетчик в накладной
      await client.run(`
        UPDATE egais_waybills
        SET scanned_bottles = scanned_bottles + 1,
            status = CASE
              WHEN scanned_bottles + 1 >= total_bottles THEN 'scanning'::text
              ELSE status
            END
        WHERE id = $1
      `, [req.params.id]);

      // Получить прогресс
      const waybill = await client.get(
        'SELECT scanned_bottles, total_bottles FROM egais_waybills WHERE id = $1',
        [req.params.id]
      );

      return {
        success: true,
        scanned: waybill.scanned_bottles,
        total: waybill.total_bottles,
        product: product.name
      };
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Завершить сканирование и отправить в ЕГАИС
router.post('/waybills/:id/complete', authMiddleware, adminOnly, tenantMiddleware, async (req, res) => {
  try {
    await db.transaction(async (client) => {
      const waybill = await client.get(
        'SELECT * FROM egais_waybills WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      );

      if (waybill.scanned_bottles < waybill.total_bottles) {
        throw new Error('Не все бутылки отсканированы');
      }

      // Получить все марки
      const stamps = await client.all(
        'SELECT * FROM excise_stamps WHERE waybill_id = $1',
        [req.params.id]
      );

      // Добавить в очередь на отправку в ЕГАИС
      await client.run(`
        INSERT INTO egais_queue
        (tenant_id, operation_type, reference_id, reference_type, payload)
        VALUES ($1, 'waybill', $2, 'waybills', $3)
      `, [
        req.tenantId,
        req.params.id,
        JSON.stringify({
          waybillId: req.params.id,
          number: waybill.number,
          stamps: stamps.map(s => s.stamp_code)
        })
      ]);

      // Обновить статус накладной
      await client.run(`
        UPDATE egais_waybills
        SET status = 'pending', sent_at = NOW()
        WHERE id = $1
      `, [req.params.id]);
    });

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============= МАРКИ И ОСТАТКИ =============

// Получить доступные марки товара
router.get('/stamps', authMiddleware, tenantMiddleware, async (req, res) => {
  const { productId, status = 'available' } = req.query;

  try {
    const stamps = await db.all(`
      SELECT s.*, p.name as product_name
      FROM excise_stamps s
      JOIN products p ON s.product_id = p.id
      WHERE s.tenant_id = $1
        AND ($2::integer IS NULL OR s.product_id = $2)
        AND s.status = $3
      ORDER BY s.received_at ASC
    `, [req.tenantId, productId || null, status]);

    res.json(stamps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Остатки по маркам (сводка)
router.get('/stamps/summary', authMiddleware, tenantMiddleware, async (req, res) => {
  try {
    const summary = await db.all(`
      SELECT
        p.id,
        p.name,
        p.current_stock as stock_quantity,
        COUNT(s.id) FILTER (WHERE s.status = 'available') as stamps_available,
        COUNT(s.id) FILTER (WHERE s.status = 'sold') as stamps_sold,
        COUNT(s.id) as stamps_total,
        (p.current_stock - COUNT(s.id) FILTER (WHERE s.status = 'available')) as discrepancy
      FROM products p
      LEFT JOIN excise_stamps s ON s.product_id = p.id AND s.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1 AND p.requires_excise_stamp = true
      GROUP BY p.id, p.name, p.current_stock
      ORDER BY p.name
    `, [req.tenantId]);

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### 2.2 Модификация routes/orders.js

Добавить автоматическое списание марок при оплате заказа:

```javascript
// В файл server/routes/orders.js добавить:

router.post('/:id/pay', authMiddleware, tenantMiddleware, async (req, res) => {
  const { id } = req.params;
  const { paymentMethod, paidCash, paidCard } = req.body;

  try {
    const result = await db.transaction(async (client) => {
      // 1. Получить товары заказа
      const items = await client.all(
        'SELECT * FROM order_items WHERE order_id = $1',
        [id]
      );

      // 2. Для каждого алкогольного товара списать марки
      for (const item of items) {
        const product = await client.get(
          'SELECT id, name, requires_excise_stamp FROM products WHERE id = $1',
          [item.product_id]
        );

        if (product?.requires_excise_stamp) {
          // Найти N самых старых марок (FIFO)
          const stamps = await client.all(`
            SELECT id, stamp_code
            FROM excise_stamps
            WHERE tenant_id = $1
              AND product_id = $2
              AND status = 'available'
            ORDER BY received_at ASC
            LIMIT $3
          `, [req.tenantId, item.product_id, item.quantity]);

          if (stamps.length < item.quantity) {
            throw new Error(
              `Недостаточно акцизных марок для "${product.name}". ` +
              `Требуется: ${item.quantity}, доступно: ${stamps.length}`
            );
          }

          // Зарезервировать марки
          const stampIds = stamps.map(s => s.id);
          await client.run(`
            UPDATE excise_stamps
            SET status = 'sold',
                sold_order_id = $1,
                sold_at = NOW()
            WHERE id = ANY($2::int[])
          `, [id, stampIds]);

          // Добавить в очередь на списание в ЕГАИС
          await client.run(`
            INSERT INTO egais_queue
            (tenant_id, operation_type, reference_id, reference_type, payload)
            VALUES ($1, 'sale', $2, 'orders', $3)
          `, [
            req.tenantId,
            id,
            JSON.stringify({
              orderId: id,
              productId: item.product_id,
              stamps: stamps.map(s => s.stamp_code)
            })
          ]);
        }
      }

      // 3. Закрыть заказ (оплата)
      await client.run(`
        UPDATE orders
        SET status = 'paid',
            payment_method = $1,
            paid_cash = $2,
            paid_card = $3,
            closed_at = NOW()
        WHERE id = $4 AND tenant_id = $5
      `, [paymentMethod, paidCash || 0, paidCard || 0, id, req.tenantId]);

      // Получить обновленный заказ
      const order = await client.get(
        'SELECT * FROM orders WHERE id = $1',
        [id]
      );

      return order;
    });

    res.json(result);
  } catch (error) {
    console.error('Payment error:', error);
    res.status(400).json({ error: error.message });
  }
});
```

### 2.3 Подключить routes в index.js

```javascript
// server/index.js
const egaisRoutes = require('./routes/egais');

// После других routes
app.use('/api/egais', egaisRoutes);
```

---

## Этап 3: Локальный агент HookahPOS (Node.js сервис)

### 3.1 Структура проекта агента

```
hookahpos-agent/
├── package.json
├── index.js              # Entry point — инициализация всех модулей
├── config.js             # Конфигурация (из ProgramData)
├── cloudSync.js          # WebSocket соединение с облаком
├── db.js                 # Локальная SQLite (offline queue)
│
├── modules/
│   ├── egais/
│   │   ├── utmClient.js       # Клиент для УТМ REST API
│   │   └── queueProcessor.js  # Обработка очереди ЕГАИС документов
│   │
│   └── kkt/                   # [Phase 4] Модуль фискального регистратора
│       ├── kktClient.js       # Клиент для ATOL DTO / WebServer API
│       ├── receiptBuilder.js  # Формирование чека для ФР
│       └── kktProcessor.js    # Обработка команд печати чеков
│
├── installer/
│   ├── setup.nsi         # NSIS installer
│   └── icon.ico
└── README.md
```

### 3.2 package.json

```json
{
  "name": "hookahpos-agent",
  "version": "1.0.0",
  "description": "Локальный агент HookahPOS (ЕГАИС, ККТ)",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "install-service": "node install-service.js",
    "uninstall-service": "node uninstall-service.js"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "socket.io-client": "^4.7.0",
    "better-sqlite3": "^9.0.0",
    "node-windows": "^1.0.0-beta.8",
    "winston": "^3.11.0"
  }
}
```

### 3.3 Основные файлы агента

**config.js**
```javascript
const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData',
                              'HookahPOS', 'agent-config.json');

// Пример конфигурации:
// {
//   "tenantSlug": "my-bar",
//   "cloudUrl": "https://hookahpos.ru",
//   "apiKey": "xxx",
//
//   // Модуль ЕГАИС (Phase 1)
//   "egais": {
//     "enabled": true,
//     "utmUrl": "http://localhost:8080",
//     "utmLogin": "",
//     "utmPassword": "",
//     "fsrarId": "030000123456"
//   },
//
//   // Модуль ККТ (Phase 4)
//   "kkt": {
//     "enabled": false,
//     "provider": "atol_dto",
//     "driverUrl": "http://localhost:16732",
//     "cashierName": "Кассир",
//     "cashierInn": ""
//   }
// }

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error('Конфигурация не найдена. Запустите установку агента.');
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function saveConfig(config) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = { loadConfig, saveConfig, configPath };
```

**modules/egais/utmClient.js**
```javascript
const axios = require('axios');

class UTMClient {
  constructor(baseURL, username, password) {
    this.client = axios.create({
      baseURL,
      auth: { username, password },
      timeout: 30000
    });
  }

  // Отправить накладную (WayBill)
  async sendWayBill(waybillData) {
    const response = await this.client.post('/opt/in/WayBill', {
      Documents: {
        Owner: {
          FSRAR_ID: waybillData.fsrarId
        },
        Document: {
          WayBill: {
            Identity: waybillData.number,
            Header: {
              // ... заполнить согласно спецификации ЕГАИС
            },
            Content: {
              Position: waybillData.stamps.map((stamp, idx) => ({
                Identity: idx + 1,
                ProductCode: stamp.alcCode,
                Quantity: 1,
                informF2: {
                  F2RegId: stamp.stampCode
                }
              }))
            }
          }
        }
      }
    });

    return response.data;
  }

  // Списать марки при продаже (ActChargeOn)
  async chargeSale(saleData) {
    const response = await this.client.post('/opt/in/ActChargeOn', {
      Documents: {
        Owner: {
          FSRAR_ID: saleData.fsrarId
        },
        Document: {
          ActChargeOn: {
            Identity: saleData.orderId,
            ActNumber: saleData.actNumber,
            ActDate: new Date().toISOString().split('T')[0],
            Content: {
              Position: saleData.stamps.map((stamp, idx) => ({
                Identity: idx + 1,
                informF2: {
                  F2RegId: stamp
                }
              }))
            }
          }
        }
      }
    });

    return response.data;
  }

  // Проверить статус документа
  async getDocumentStatus(documentId) {
    const response = await this.client.get(`/opt/out/ReplyDoc?documentId=${documentId}`);
    return response.data;
  }

  // Проверить соединение с УТМ
  async ping() {
    try {
      await this.client.get('/ping');
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = UTMClient;
```

**cloudSync.js**
```javascript
const io = require('socket.io-client');
const winston = require('winston');

class CloudSync {
  constructor(cloudUrl, apiKey, onMessage) {
    this.cloudUrl = cloudUrl;
    this.apiKey = apiKey;
    this.onMessage = onMessage;
    this.socket = null;
    this.logger = winston.createLogger({
      transports: [new winston.transports.Console()]
    });
  }

  connect() {
    this.socket = io(this.cloudUrl, {
      auth: { token: this.apiKey },
      reconnection: true,
      reconnectionDelay: 5000
    });

    this.socket.on('connect', () => {
      this.logger.info('Подключено к облаку HookahPOS');
      this.sendHeartbeat();
    });

    this.socket.on('disconnect', () => {
      this.logger.warn('Отключено от облака');
    });

    // Слушать команды от облака — ЕГАИС
    this.socket.on('egais:sendWayBill', (data) => {
      this.onMessage('egais:sendWayBill', data);
    });

    this.socket.on('egais:chargeSale', (data) => {
      this.onMessage('egais:chargeSale', data);
    });

    // Слушать команды от облака — ККТ (Phase 4)
    this.socket.on('kkt:print', (data) => {
      this.onMessage('kkt:print', data);
    });

    this.socket.on('kkt:refund', (data) => {
      this.onMessage('kkt:refund', data);
    });

    this.socket.on('kkt:xReport', (data) => {
      this.onMessage('kkt:xReport', data);
    });

    // Heartbeat каждые 30 секунд
    setInterval(() => this.sendHeartbeat(), 30000);
  }

  sendHeartbeat() {
    if (this.socket?.connected) {
      this.socket.emit('agent:heartbeat', {
        timestamp: Date.now(),
        version: require('./package.json').version,
        modules: this.activeModules || {}
        // { egais: { online: true }, kkt: { online: true, model: 'ATOL 30F' } }
      });
    }
  }

  setActiveModules(modules) {
    this.activeModules = modules;
  }

  sendStatus(queueItemId, status, data) {
    if (this.socket?.connected) {
      this.socket.emit('agent:status', {
        queueItemId,
        status,
        data
      });
    }
  }

  disconnect() {
    this.socket?.disconnect();
  }
}

module.exports = CloudSync;
```

**index.js** (главный файл агента)
```javascript
const { loadConfig } = require('./config');
const CloudSync = require('./cloudSync');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'agent.log' }),
    new winston.transports.Console()
  ]
});

async function main() {
  try {
    const config = loadConfig();
    logger.info('Конфигурация загружена', { slug: config.tenantSlug });

    // ========== Модуль ЕГАИС ==========
    let egaisProcessor = null;
    if (config.egais?.enabled) {
      const UTMClient = require('./modules/egais/utmClient');
      const EgaisQueueProcessor = require('./modules/egais/queueProcessor');

      const utmClient = new UTMClient(
        config.egais.utmUrl,
        config.egais.utmLogin,
        config.egais.utmPassword
      );

      egaisProcessor = new EgaisQueueProcessor(utmClient, logger);

      // Проверка УТМ каждые 60 секунд
      setInterval(async () => {
        const isUtmOnline = await utmClient.ping();
        logger.info('Статус УТМ', { online: isUtmOnline });
      }, 60000);

      logger.info('Модуль ЕГАИС включен');
    }

    // ========== Модуль ККТ (Phase 4) ==========
    let kktProcessor = null;
    if (config.kkt?.enabled) {
      const KktClient = require('./modules/kkt/kktClient');
      const KktProcessor = require('./modules/kkt/kktProcessor');

      const kktClient = new KktClient(config.kkt.driverUrl);
      kktProcessor = new KktProcessor(kktClient, config.kkt, logger);

      // Проверка доступности ФР каждые 30 секунд
      setInterval(async () => {
        const isKktOnline = await kktClient.ping();
        logger.info('Статус ФР', { online: isKktOnline });
      }, 30000);

      logger.info('Модуль ККТ включен', { provider: config.kkt.provider });
    }

    // ========== WebSocket к облаку ==========
    const cloudSync = new CloudSync(
      config.cloudUrl,
      config.apiKey,
      async (command, data) => {
        logger.info('Получена команда от облака', { command });

        // Маршрутизация команд по модулям
        if (command.startsWith('egais:') && egaisProcessor) {
          await egaisProcessor.process(command, data);
        } else if (command.startsWith('kkt:') && kktProcessor) {
          // Phase 4: kkt:print, kkt:refund, kkt:status, kkt:xReport, kkt:zReport
          const result = await kktProcessor.process(command, data);
          cloudSync.sendStatus(data.queueItemId, result.status, result);
        }
      }
    );

    cloudSync.connect();
    logger.info('Агент HookahPOS запущен', {
      modules: {
        egais: !!egaisProcessor,
        kkt: !!kktProcessor
      }
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('Получен SIGTERM, завершение работы...');
      cloudSync.disconnect();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Ошибка запуска агента', { error: error.message });
    process.exit(1);
  }
}

main();
```

---

## Этап 4: Клиентский UI (React)

### 4.1 Страница сканирования накладной

**Файл**: `client/src/pages/EgaisWaybillScan.jsx`

```jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import './EgaisWaybillScan.css';

function EgaisWaybillScan() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [waybill, setWaybill] = useState(null);
  const [currentItem, setCurrentItem] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const scanInputRef = useRef();

  useEffect(() => {
    loadWaybill();
  }, [id]);

  useEffect(() => {
    // Автофокус на input
    scanInputRef.current?.focus();
  }, [currentItem]);

  const loadWaybill = async () => {
    try {
      const data = await api.get(`/egais/waybills/${id}`);
      setWaybill(data);

      // Найти первую незавершенную позицию
      const incomplete = data.items.find(item => !item.is_complete);
      if (incomplete) {
        setCurrentItem(incomplete);
        setCurrentIndex(data.items.indexOf(incomplete));
      }

      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleScan = async (e) => {
    if (e.key !== 'Enter') return;

    const stampCode = e.target.value.trim();
    if (!stampCode) return;

    try {
      const result = await api.post(`/egais/waybills/${id}/scan-stamp`, {
        stampCode,
        productId: currentItem.product_id
      });

      // Успех - звук и очистка
      playSound('success');
      e.target.value = '';

      // Обновить счетчики
      setWaybill(prev => ({
        ...prev,
        scanned_bottles: result.scanned
      }));

      setCurrentItem(prev => ({
        ...prev,
        scanned_quantity: prev.scanned_quantity + 1
      }));

      // Если позиция завершена, переход к следующей
      if (currentItem.scanned_quantity + 1 >= currentItem.quantity) {
        const nextItem = waybill.items[currentIndex + 1];
        if (nextItem && !nextItem.is_complete) {
          setCurrentItem(nextItem);
          setCurrentIndex(currentIndex + 1);
        } else {
          // Все отсканировано
          if (result.scanned >= waybill.total_bottles) {
            showCompletionDialog();
          }
        }
      }

    } catch (err) {
      playSound('error');
      setError(err.message);
      setTimeout(() => setError(''), 3000);
      e.target.value = '';
    }
  };

  const playSound = (type) => {
    const audio = new Audio(type === 'success' ? '/sounds/beep.mp3' : '/sounds/error.mp3');
    audio.play().catch(() => {});
  };

  const showCompletionDialog = () => {
    if (confirm('Все марки отсканированы. Отправить накладную в ЕГАИС?')) {
      completeWaybill();
    }
  };

  const completeWaybill = async () => {
    try {
      await api.post(`/egais/waybills/${id}/complete`);
      alert('Накладная отправлена в ЕГАИС');
      navigate('/egais/waybills');
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div className="waybill-scan">
      <div className="waybill-header">
        <h2>Сканирование накладной №{waybill?.number}</h2>
        <div className="overall-progress">
          <span>{waybill?.scanned_bottles} / {waybill?.total_bottles}</span>
          <progress value={waybill?.scanned_bottles} max={waybill?.total_bottles} />
        </div>
      </div>

      {currentItem && (
        <div className="current-product">
          <h3>{currentItem.product_name}</h3>
          <div className="product-progress">
            <div className="count">
              {currentItem.scanned_quantity} / {currentItem.quantity}
            </div>
            <progress
              value={currentItem.scanned_quantity}
              max={currentItem.quantity}
              className="product-bar"
            />
          </div>
        </div>
      )}

      <div className="scan-area">
        <input
          ref={scanInputRef}
          type="text"
          placeholder="Отсканируйте акцизную марку..."
          onKeyDown={handleScan}
          className="scan-input"
          autoFocus
        />
        {error && <div className="error-message">{error}</div>}
      </div>

      <div className="instructions">
        <h4>Инструкция:</h4>
        <ol>
          <li>Наведите сканер штрихкодов на акцизную марку</li>
          <li>Дождитесь звукового сигнала</li>
          <li>Повторите для всех бутылок</li>
        </ol>
      </div>

      <div className="items-list">
        <h4>Позиции накладной:</h4>
        {waybill?.items.map((item, idx) => (
          <div
            key={item.id}
            className={`item ${idx === currentIndex ? 'active' : ''} ${item.is_complete ? 'complete' : ''}`}
          >
            <span className="name">{item.product_name}</span>
            <span className="progress-text">
              {item.scanned_quantity} / {item.quantity}
            </span>
            {item.is_complete && <span className="checkmark">✓</span>}
          </div>
        ))}
      </div>

      <div className="actions">
        <button onClick={() => navigate('/egais/waybills')} className="btn-secondary">
          Отменить
        </button>
        {waybill?.scanned_bottles >= waybill?.total_bottles && (
          <button onClick={completeWaybill} className="btn-primary">
            Завершить и отправить в ЕГАИС
          </button>
        )}
      </div>
    </div>
  );
}

export default EgaisWaybillScan;
```

### 4.2 Страница управления накладными

**Файл**: `client/src/pages/EgaisWaybills.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

function EgaisWaybills() {
  const [waybills, setWaybills] = useState([]);
  const [agentStatus, setAgentStatus] = useState(null);

  useEffect(() => {
    loadWaybills();
    loadAgentStatus();
  }, []);

  const loadWaybills = async () => {
    const data = await api.get('/egais/waybills');
    setWaybills(data);
  };

  const loadAgentStatus = async () => {
    const data = await api.get('/egais/agents/status');
    setAgentStatus(data);
  };

  const statusColors = {
    draft: '#gray',
    scanning: '#blue',
    pending: '#orange',
    sent: '#purple',
    accepted: '#green',
    rejected: '#red'
  };

  const statusLabels = {
    draft: 'Черновик',
    scanning: 'Сканирование',
    pending: 'Ожидает отправки',
    sent: 'Отправлено',
    accepted: 'Принято ЕГАИС',
    rejected: 'Отклонено'
  };

  return (
    <div className="egais-waybills">
      <div className="page-header">
        <h2>ЕГАИС - Накладные</h2>
        <div className="agent-status">
          <span className={`status-badge ${agentStatus?.isOnline ? 'online' : 'offline'}`}>
            {agentStatus?.isOnline ? '🟢 Агент онлайн' : '🔴 Агент оффлайн'}
          </span>
        </div>
      </div>

      {!agentStatus?.isConfigured && (
        <div className="alert alert-warning">
          ⚠️ ЕГАИС агент не настроен. <Link to="/settings/egais">Настроить</Link>
        </div>
      )}

      <div className="actions">
        <Link to="/egais/waybills/new" className="btn-primary">
          + Новая накладная
        </Link>
      </div>

      <table className="waybills-table">
        <thead>
          <tr>
            <th>Номер</th>
            <th>Дата</th>
            <th>Поставщик</th>
            <th>Позиций</th>
            <th>Прогресс</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {waybills.map(wb => (
            <tr key={wb.id}>
              <td>{wb.number}</td>
              <td>{new Date(wb.document_date).toLocaleDateString('ru')}</td>
              <td>{wb.supplier_name}</td>
              <td>{wb.total_positions}</td>
              <td>
                <div className="progress-mini">
                  <span>{wb.scanned_bottles}/{wb.total_bottles}</span>
                  <progress value={wb.scanned_bottles} max={wb.total_bottles} />
                </div>
              </td>
              <td>
                <span
                  className="status-badge"
                  style={{ backgroundColor: statusColors[wb.status] }}
                >
                  {statusLabels[wb.status]}
                </span>
              </td>
              <td>
                {wb.status === 'draft' && (
                  <Link to={`/egais/waybills/${wb.id}/scan`} className="btn-small">
                    Сканировать
                  </Link>
                )}
                {wb.status === 'scanning' && wb.scanned_bottles < wb.total_bottles && (
                  <Link to={`/egais/waybills/${wb.id}/scan`} className="btn-small">
                    Продолжить
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default EgaisWaybills;
```

### 4.3 Добавить роуты

```jsx
// client/src/App.jsx
import EgaisWaybills from './pages/EgaisWaybills';
import EgaisWaybillScan from './pages/EgaisWaybillScan';
import EgaisSettings from './pages/EgaisSettings';

// В SubdomainApp добавить:
<Route path="/egais/waybills" element={<AdminRoute><EgaisWaybills /></AdminRoute>} />
<Route path="/egais/waybills/:id/scan" element={<AdminRoute><EgaisWaybillScan /></AdminRoute>} />
<Route path="/settings/egais" element={<OwnerRoute><EgaisSettings /></OwnerRoute>} />
```

---

## Этап 5: Тестирование и деплой

### 5.1 Локальное тестирование (без реального УТМ)

Создать mock УТМ для разработки:

```javascript
// server/test-utils/mockUTM.js
const express = require('express');
const app = express();

app.use(express.json());

app.post('/opt/in/WayBill', (req, res) => {
  console.log('Mock УТМ: получена накладная', req.body);
  res.json({ documentId: 'MOCK-' + Date.now() });
});

app.post('/opt/in/ActChargeOn', (req, res) => {
  console.log('Mock УТМ: списание марок', req.body);
  res.json({ documentId: 'MOCK-SALE-' + Date.now() });
});

app.get('/ping', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(8080, () => {
  console.log('Mock УТМ запущен на http://localhost:8080');
});
```

Запуск: `node server/test-utils/mockUTM.js`

### 5.2 Чеклист перед продакшеном (ЕГАИС)

- [ ] Миграция 012 применена на проде
- [ ] ЕГАИС routes подключены
- [ ] Локальный агент собран в EXE
- [ ] NSIS installer протестирован
- [ ] WebSocket соединение работает через nginx
- [ ] Тестирование на реальном УТМ (тестовая среда ЕГАИС)
- [ ] Документация для клиентов (как установить агент)
- [ ] Обучающее видео для менеджеров (сканирование накладных)

---

## Roadmap разработки

### Phase 1: MVP (40-50 часов)
- [x] Архитектура и план
- [ ] Миграция БД (2 часа)
- [ ] Server API - накладные и марки (10 часов)
- [ ] Server API - автоматическое списание при продаже (4 часа)
- [ ] Клиентский агент - базовая версия (12 часов)
- [ ] UI - сканирование накладных (8 часов)
- [ ] UI - список накладных и статусы (4 часов)
- [ ] Тестирование с mock УТМ (6 часов)
- [ ] Документация (4 часа)

**Результат**: можно сканировать марки при приемке, автоматическое списание при продаже, отправка в ЕГАИС через агента

### Phase 2: Production Ready (30 часов)
- [ ] Установщик агента (NSIS) (8 часов)
- [ ] Автообновление агента (6 часов)
- [ ] UI - настройки ЕГАИС в админке (4 часа)
- [ ] UI - мониторинг статуса агента (3 часа)
- [ ] Обработка ошибок и retry логика (5 часов)
- [ ] Тестирование с реальным УТМ (тестовая среда ЕГАИС) (8 часов)
- [ ] Обучающие материалы для клиентов (4 часа)

**Результат**: готовое решение для продакшена

### Phase 3: ЕГАИС — Advanced Features (40 часов)
- [ ] Инвентаризация марок (8 часов)
- [ ] Возвраты и списания (6 часов)
- [ ] Отчеты по ЕГАИС (расхождения, аудит) (6 часов)
- [ ] Массовый импорт марок из XML (4 часа)
- [ ] История марки (от прихода до продажи) (4 часа)
- [ ] Уведомления при расхождениях (3 часа)
- [ ] Electron GUI для агента (10 часов)

**Результат**: полнофункциональная интеграция с ЕГАИС

### Phase 4: ККТ — Фискальный регистратор через агента (35-40 часов)

**Предпосылки**: агент уже работает (Phase 1-2), ATOL Online уже реализован в облаке — переиспользуем модель данных `kkt_receipts` и UI.

#### 4.1 Модуль агента — `modules/kkt/` (12 часов)

**`kktClient.js`** — клиент для ATOL DTO / WebServer:
- `ping()` — проверка доступности ФР
- `getDeviceInfo()` — модель, серийный номер, статус ФН
- `sell(receipt)` — фискализация чека продажи
- `sellRefund(receipt)` — чек возврата
- `xReport()` — X-отчёт (без закрытия смены)
- `zReport()` — Z-отчёт (закрытие смены ФР)
- `openShift(cashierName)` — открытие смены ФР
- `getShiftStatus()` — статус текущей смены ФР

**`receiptBuilder.js`** — конвертация данных из облачного формата в формат ATOL DTO:
- Маппинг полей: items, payments, vat, client info
- Формат ATOL DTO отличается от ATOL Online API

**`kktProcessor.js`** — обработка WebSocket команд:
- `kkt:print` → собрать чек → отправить на ФР → вернуть фискальные данные
- `kkt:refund` → чек возврата
- `kkt:xReport` → запрос X-отчёта
- `kkt:zReport` → закрытие смены ФР
- Локальная очередь в SQLite при потере связи с облаком

#### 4.2 Серверная часть — провайдер `agent` (8 часов)

Добавить новый провайдер в `server/services/kkt/providers/`:

**`agentProvider.js`** — отправка чека через WebSocket агенту вместо облачного API:
- Вместо HTTP-запроса на `online.atol.ru` → WebSocket event `kkt:print` агенту
- Ожидание ответа `agent:status` с фискальными данными (с таймаутом)
- Ответ синхронный (ФР печатает ~2-3 сек) в отличие от ATOL Online (polling)

**`kktProviderFactory.js`** — расширить:
```javascript
case 'atol':        return new AtolProvider(config);     // облако
case 'agent_atol':  return new AgentProvider(config);    // ФР через агента
```

Настройка в `tenant_integrations.kkt_provider`:
- `'atol'` — облачная фискализация (ATOL Online, как сейчас)
- `'agent_atol'` — физический ФР через локального агента

#### 4.3 Серверная часть — WebSocket обработка (4 часа)

В `server/socket.js` добавить:
- Namespace/room для агентов: `agent:{tenantId}`
- Обработка `agent:heartbeat` — обновление `egais_agents.is_online`, `last_ping_at` + статус модулей
- Обработка `agent:status` — результат фискализации → обновление `kkt_receipts`
- Функция `sendToAgent(tenantId, event, data)` — для отправки команд агенту из route handlers

#### 4.4 Клиентская часть — настройки (4 часа)

В `IntegrationSettings.jsx` расширить выбор ККТ провайдера:
- "АТОЛ Онлайн" (облачная фискализация) — текущий
- "Фискальный регистратор (через агент)" — новый
  - Показывать статус агента и ФР (онлайн/оффлайн)
  - Информация об устройстве (модель, ФН, срок действия ФН)
  - Кнопка "Тест печати" — тестовый нефискальный чек
  - Кнопка "X-отчёт" / "Z-отчёт"

#### 4.5 Тестирование и mock (6 часов)

Расширить mock-сервер для эмуляции ATOL DTO:
```javascript
// В test-utils/mockATOLDTO.js — эмуляция ATOL WebServer на :16732
app.post('/api/v2/sell', (req, res) => {
  res.json({
    fiscalParams: {
      fiscalDocumentNumber: 12345,
      fiscalSign: '1234567890',
      fnNumber: '9999078900012345',
      registrationNumber: 'KKT-001',
      receiptDatetime: new Date().toISOString()
    }
  });
});
```

#### 4.6 Workflow фискализации через агента

```
Кассир закрывает заказ в браузере
  → POST /api/orders/:id/close
  → kkt_provider = 'agent_atol'
  → AgentProvider.sell(receipt)
  → WebSocket event 'kkt:print' → агент
  → Агент → ATOL DTO (localhost:16732) → ФР → печать чека
  → Агент получает фискальные данные
  → WebSocket event 'agent:status' → сервер
  → Обновление kkt_receipts (fiscal_number, etc.)
  → WebSocket event → браузер (обновление UI)
  → Кассир видит "Чек напечатан, ФД №12345"
```

Время отклика: ~2-3 сек (печать на ФР) вместо ~5-15 сек (ATOL Online polling).

#### 4.7 Чеклист перед продакшеном (ККТ)

- [ ] `agentProvider.js` реализован и подключен в factory
- [ ] WebSocket обработка `kkt:*` команд на сервере
- [ ] Модуль `modules/kkt/` в агенте
- [ ] UI настроек расширен для выбора провайдера
- [ ] Mock ATOL DTO для тестов
- [ ] Тест с реальным ATOL DTO + ФР (АТОЛ 30Ф или аналог)
- [ ] Обработка ситуации "агент оффлайн" (fallback / ошибка)
- [ ] Обработка ситуации "ФР оффлайн / замятие бумаги / ФН переполнен"

**Результат**: клиент может выбрать между облачной фискализацией (ATOL Online) и физическим фискальным регистратором через агент. Один агент обслуживает и ЕГАИС, и ККТ.

---

## Стоимость инфраструктуры

- **Разработка**: 145-160 часов (Phase 1-4)
- **Тестовая среда ЕГАИС**: бесплатно (требуется регистрация)
- **Тестовый УТМ**: бесплатно (скачать с сайта ФСРАР)
- **ЭЦП для тестов**: ~3000₽ (тестовый сертификат)
- **Сертификация решения в ФСРАР**: ~100 000₽ (обязательно для коммерческого использования)

---

## Юридические требования

⚠️ **Важно для легального использования**:

1. **Тестирование обязательно** — нельзя сразу в прод, только через тестовую среду ЕГАИС
2. **Сертификация ФСРАР** — коммерческое ПО для ЕГАИС должно быть сертифицировано
3. **Договор с УТМ провайдером** — клиент должен иметь лицензию на УТМ
4. **ЭЦП** — у каждого клиента своя электронная подпись

---

## Что дальше?

После утверждения плана начинаем с **Phase 1 (MVP ЕГАИС)**:

1. Применяем миграцию БД
2. Разрабатываем Server API
3. Создаём базовую версию агента (модульная архитектура)
4. Делаем UI для сканирования
5. Тестируем на mock УТМ

**Phase 4 (ККТ через агента)** реализуется после стабильной работы ЕГАИС — переиспользуем инфраструктуру агента, WebSocket-канал, и модель данных `kkt_receipts`.
