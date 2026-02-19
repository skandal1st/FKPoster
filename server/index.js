const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const { getDb } = require('./db');

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

const app = express();

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

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

// Production: serve React build
if (config.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
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
  app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${config.PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
