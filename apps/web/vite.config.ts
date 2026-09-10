import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  resolve: {
    alias: {
      '@pilot-logbook/core': new URL('../../packages/core/src', import.meta.url).pathname
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Pilot Logbook',
        short_name: 'Pilot Logbook',
        display: 'standalone',
        start_url: '/',
        theme_color: '#102a43',
        background_color: '#f7fafc'
      },
      workbox: {
        navigateFallback: '/index.html'
      }
    })
  ],
  test: {
    name: 'web',
    environment: 'jsdom',
    globals: true,
    setupFiles: new URL('./src/test/setup.ts', import.meta.url).pathname
  }
});
