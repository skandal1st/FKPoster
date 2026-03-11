import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Кеширование статики
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Runtime-кеширование API GET-запросов (справочные данные)
        runtimeCaching: [
          {
            // Справочные GET-запросы: products, categories, halls, guests, workshops, register, print-settings, employees
            urlPattern: /\/api\/(products|categories|halls|tables|guests|workshops|register\/current|tenant\/print-settings|auth\/employees|auth\/tenant-info)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60, // 24 часа
              },
              networkTimeoutSeconds: 5,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // GET заказов (для офлайн-просмотра)
            urlPattern: /\/api\/orders/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-orders-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 12 * 60 * 60,
              },
              networkTimeoutSeconds: 5,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // auth/me — для восстановления сессии
            urlPattern: /\/api\/auth\/me$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-auth-cache',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
              networkTimeoutSeconds: 3,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: false, // Используем свой manifest.json из public/
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        headers: {
          // Пробрасываем оригинальный Host чтобы subdomain middleware на сервере видел сабдомен
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            proxyReq.setHeader('X-Forwarded-Host', req.headers.host || '');
          });
        },
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
