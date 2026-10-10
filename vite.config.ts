import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import type { VitePWAOptions } from 'vite-plugin-pwa';

const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  includeAssets: ['favicon.svg', 'robots.txt'],
  manifest: {
    name: 'FlowLab — Visual Workflow Builder',
    short_name: 'FlowLab',
    description:
      'Local-first visual workflow automation editor with a real execution engine.',
    theme_color: '#0f172a',
    background_color: '#0f172a',
    display: 'standalone',
    start_url: '/flowlab/',
    scope: '/flowlab/',
    icons: [
      {
        src: 'pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: 'pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'pwa-icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    // Precache the app shell so the editor works fully offline after first load.
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
    navigateFallback: 'index.html',
    runtimeCaching: [
      {
        // App shell + chunks: cache-first, they are content-hashed.
        urlPattern: ({ request }) =>
          request.destination === 'script' || request.destination === 'style',
        handler: 'CacheFirst',
        options: {
          cacheName: 'flowlab-assets',
          expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
    ],
  },
  devOptions: {
    enabled: false,
  },
};

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from the /flowlab/ subdirectory.
  base: '/flowlab/',
  plugins: [react(), VitePWA(pwaOptions)],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      include: ['src/lib/workflow/**/*.ts', 'src/lib/db/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        // The core execution engine must be meaningfully covered.
        'src/lib/workflow/engine.ts': { lines: 80, branches: 80, functions: 80, statements: 80 },
        'src/lib/workflow/nodeRegistry.ts': { lines: 80, branches: 80, functions: 80, statements: 80 },
        'src/lib/workflow/migrations.ts': { lines: 80, branches: 80, functions: 80, statements: 80 },
        'src/lib/workflow/history.ts': { lines: 80, branches: 80, functions: 80, statements: 80 },
      },
    },
  },
});
