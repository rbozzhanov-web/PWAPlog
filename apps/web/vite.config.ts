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
        name: 'eScrew',
        short_name: 'eScrew',
        description: "Roster, pay and logbook for an airline pilot, kept on the device.",
        display: 'standalone',
        start_url: base,
        scope: base,
        theme_color: '#102a43',
        background_color: '#f7fafc',
        // "any" and "maskable" are different pictures, not one picture used twice: a maskable
        // icon is cropped to a shape the platform chooses, so it carries a full-bleed background
        // and keeps its artwork inside the centred 80% safe circle. Declaring one icon as both,
        // as this did, means Android crops art drawn to sit against the corners.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
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
