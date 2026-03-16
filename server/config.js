require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';

if (NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required in production');
  process.exit(1);
}

module.exports = {
  PORT: process.env.PORT || 3001,
  NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://hookahpos:hookahpos@localhost:5432/hookahpos',
  JWT_SECRET: process.env.JWT_SECRET || 'hookahpos-dev-secret-do-not-use-in-production',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  BASE_DOMAIN: process.env.BASE_DOMAIN || 'lvh.me',
  BASE_URL: process.env.BASE_URL || null,
};
