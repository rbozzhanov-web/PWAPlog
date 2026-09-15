import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The path the app is served from. Root by default, which is what Cloudflare Pages and a local
// preview both want; the GitHub Pages workflow sets it to the repository subpath. Inferring this
// from GITHUB_ACTIONS was wrong the moment a second target existed — any workflow, including a
// Cloudflare deploy run from Actions, would have built the subpath version.
const base = process.env.PUBLIC_BASE_PATH ?? '/';

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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,mjs}'],
        // Must be the precached entry for this base, or Workbox throws non-precached-url
        // while the service worker is evaluating and offline never starts.
        navigateFallback: `${base}index.html`
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
