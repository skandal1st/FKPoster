const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const { getDb } = require('./db');
const { subdomainMiddleware } = require('./middleware/subdomain');
const { setupSocket } = require('./socket');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const hallRoutes = require('./routes/halls');
const tableRoutes = require('./routes/tables');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const ingredientRoutes = require('./routes/ingredients');
const supplyRoutes = require('./routes/supplies');
const registerRoutes = require('./routes/register');
const orderRoutes = require('./routes/orders');
const statsRoutes = require('./routes/stats');
const inventoryRoutes = require('./routes/inventories');
const tenantRoutes = require('./routes/tenants');
const subscriptionRoutes = require('./routes/subscriptions');
const superadminRoutes = require('./routes/superadmin');
const integrationRoutes = require('./routes/integrations');
const egaisRoutes = require('./routes/egais');
const markingRoutes = require('./routes/marking');
const guestRoutes = require('./routes/guests');
const ingredientGroupRoutes = require('./routes/ingredientGroups');
const workshopRoutes = require('./routes/workshops');
const chainRoutes = require('./routes/chain');
const scheduleRoutes = require('./routes/schedule');
const salaryRoutes = require('./routes/salary');
const edoRoutes = require('./routes/edo');
const counterpartyRoutes = require('./routes/counterparties');
const kktRoutes = require('./routes/kkt');
const modifierRoutes = require('./routes/modifiers');
const uploadRoutes = require('./routes/upload');

const app = express();

// За nginx — использовать реальный IP клиента из X-Forwarded-For
app.set('trust proxy', 1);

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS — разрешить *.BASE_DOMAIN + localhost/127.0.0.1 + Capacitor (exact suffix match)
const baseDomain = config.BASE_DOMAIN;
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow non-browser (curl, etc)
    // Capacitor WebView: capacitor://localhost
    if (origin.startsWith('capacitor://')) return callback(null, true);
    let hostname;
    try {
      hostname = new URL(origin).hostname;
    } catch {
      return callback(null, false);
    }
    const allowed =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === baseDomain ||
      hostname.endsWith('.' + baseDomain);
    callback(null, allowed);
  },
  credentials: true,
}));

app.use(express.json());

// Subdomain middleware — определяем tenant по сабдомену
app.use(subdomainMiddleware);

// Rate limiting — ключ по host:IP чтобы один tenant не блокировал остальных за nginx
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
    const realIp = req.headers['x-real-ip'] || req.ip;
    return `${host}:${realIp}`;
  },
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `auth:${req.headers['x-real-ip'] || req.ip}`;
  },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/pin-login', authLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/halls', hallRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/supplies', supplyRoutes);
app.use('/api/register', registerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/inventories', inventoryRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/egais', egaisRoutes);
app.use('/api/marking', markingRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/ingredient-groups', ingredientGroupRoutes);
app.use('/api/workshops', workshopRoutes);
app.use('/api/chain', chainRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/edo', edoRoutes);
app.use('/api/counterparties', counterpartyRoutes);
app.use('/api/kkt', kktRoutes);
app.use('/api/modifiers', modifierRoutes);
app.use('/api/upload', uploadRoutes);

// Serve uploaded files (product images)
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Production: serve React build
if (config.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// Error handler (в т.ч. необработанные ошибки из async-роутов — чтобы не ронять процесс и не отдавать 502)
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  if (!res.headersSent) {
    const code = err.code || '';
    const msg = code === '42P01' ? 'Ошибка БД: таблица не найдена. Выполните миграции: docker compose exec app node migrations/run.js' : 'Внутренняя ошибка сервера';
    res.status(500).json({ error: msg });
  }
});

async function connectDb(retries = 10, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await getDb();
      console.log('Database connected');
      return;
    } catch (err) {
      console.error(`Database connection attempt ${i + 1}/${retries} failed:`, err.message);
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function start() {
  await connectDb();
  const server = app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${config.PORT}`);
  });
  const io = await setupSocket(server);
  app.set('io', io);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
