import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.GITHUB_ACTIONS ? '/PWAPlog/' : '/';

export default defineConfig({
  base,
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
        start_url: base,
        scope: base,
        theme_color: '#102a43',
        background_color: '#f7fafc',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
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
