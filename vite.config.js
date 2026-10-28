import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readTokens } from './scripts/tokens.mjs';

// Colours come from src/styles/tokens.css so there is one source of truth.
const tokens = readTokens();
const THEME_COLOR = tokens.primary;
const BACKGROUND_COLOR = tokens.canvas;

/** Replaces %AGRISENCE_THEME_COLOR% in index.html with the primary token. */
function themeColorPlugin() {
  return {
    name: 'agrisence-theme-color',
    transformIndexHtml(html) {
      return html.replaceAll('%AGRISENCE_THEME_COLOR%', THEME_COLOR);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    themeColorPlugin(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      // Registration is done by src/components/feedback/PwaUpdatePrompt.jsx, only in production builds.
      injectRegister: false,
      devOptions: { enabled: false },
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'AgriSence',
        short_name: 'AgriSence',
        description: 'Crop price forecasts and a farmer to buyer marketplace.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'en',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache only the static files produced by the build.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        // NO runtime caching, on purpose. API responses (prices, forecasts, orders,
        // account data) and remote images must never be served from a cache: a stale
        // price or forecast could mislead a selling decision, and cached account data
        // on a shared phone is a privacy risk. Do not add runtimeCaching entries.
        // scripts/check-build.mjs fails the build check if one appears.
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // No source maps in production output (scripts/check-build.mjs verifies this).
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
    env: {
      // Origin only: the OpenAPI paths already start with /api/v1.
      VITE_API_BASE_URL: 'http://localhost:8000',
      VITE_SHOW_API_STATUS: 'false',
      // Google sign in is off unless a test sets a client ID (vi.stubEnv), so a local .env never
      // makes the sign in screens load Google in tests.
      VITE_GOOGLE_CLIENT_ID: '',
    },
    testTimeout: 15000,
  },
});
