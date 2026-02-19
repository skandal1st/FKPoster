require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://hookahpos:hookahpos@localhost:5432/hookahpos',
  JWT_SECRET: process.env.JWT_SECRET || 'hookahpos-secret-key-2024',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
