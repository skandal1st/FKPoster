module.exports = {
  apps: [{
    name: 'hookahpos',
    script: 'index.js',
    instances: process.env.PM2_INSTANCES || 'max',
    exec_mode: 'cluster',
    max_memory_restart: '512M',
  }],
};
