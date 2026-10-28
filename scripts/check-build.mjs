#!/usr/bin/env node
// npm run check:build (after npm run build). Verifies the production output:
// - the web manifest has the required fields and icons;
// - the service worker has no runtime caching route and does not contain the API address;
// - the development role switcher is not in the build;
// - no source maps or .env content are emitted;
// - the initial JavaScript stays within the performance budget;
// - no lazy chunk is over its own budget, and Recharts, the photo helper, the buyer screens and
//   the admin screens are only in lazy chunks; the admin screens never include Recharts;
// - Google's script address (the only third party script) is only in a lazy chunk and never in
//   index.html (identity v2, prompt 6).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { loadEnv } from 'vite';
import { readTokens } from './tokens.mjs';

// Performance budget: initial JavaScript (entry plus modulepreloaded chunks), gzipped.
// Smallholder farmers often use low end phones on slow mobile data; raise this only on purpose.
const INITIAL_JS_BUDGET_KB = 250;
// Second budget: no single lazily loaded chunk (a screen, the chart) above this, gzipped.
const LAZY_CHUNK_BUDGET_KB = 250;
// A string only Recharts' code contains (its wrapper class name). It must never be in the
// initial JavaScript: the trend chart loads Recharts lazily.
const RECHARTS_MARKER = 'recharts-wrapper';
// The photo helper's error name (src/lib/image.js). The helper is loaded with a dynamic import
// when a farmer picks a photo, so it must never be in the initial JavaScript.
const IMAGE_HELPER_MARKER = 'ImageError';
// Text only the buyer payment screen contains (src/lib/buyerMessages.js). The buyer screens are
// lazily loaded routes, so it must never be in the initial JavaScript (F3).
const BUYER_SCREEN_MARKER = 'Check payment request';
// Text only the admin screens contain (src/lib/adminMessages.js). The admin screens are lazily
// loaded routes, so it must never be in the initial JavaScript (F4).
const ADMIN_SCREEN_MARKER = 'Data pipeline health';
// Strings only the lazily loaded account screens contain (identity v2, prompt 4): the code form
// (both code screens), the registration role cards, and the reset and invitation forms. The
// sign in screen stays in the initial JavaScript; these must not.
const AUTH_LAZY_MARKERS = Object.freeze({
  'code screens': 'data-auth-code-step',
  registration: 'register-role-',
  'password reset': 'reset-confirmPassword',
  'accept invitation': 'invite-confirmPassword',
});

// Google Identity Services (prompt 6): its host may appear only in the lazy Google button chunk.
const GOOGLE_HOST = 'accounts.google.com';
const GOOGLE_SCRIPT_MARKER = 'accounts.google.com/gsi/client';
// The Google role screen and the account screens are lazily loaded routes.
const GOOGLE_LAZY_MARKERS = Object.freeze({
  'Google role screen': 'google-role-warning',
  'sign-in methods screen': 'security-how',
  'set password screen': 'set-password-confirmPassword',
});

const DIST = 'dist';
const DEV_SWITCHER_MARKER = 'agrisence-dev-role-switcher';
const RUNTIME_STRATEGIES =
  /\b(NetworkFirst|CacheFirst|StaleWhileRevalidate|NetworkOnly|CacheOnly)\b/;

const failures = [];
const fail = (message) => failures.push(message);

if (!existsSync(DIST)) {
  console.error('check:build FAILED: dist/ does not exist. Run "npm run build" first.');
  process.exit(1);
}

/** @param {string} dir */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const files = walk(DIST).map((f) => relative(DIST, f).split(sep).join('/'));
const read = (file) => readFileSync(join(DIST, file), 'utf8');
const isText = (file) => /\.(js|mjs|css|html|json|webmanifest|txt|svg|map)$/.test(file);

// 1. Manifest.
const tokens = readTokens();
const manifestFile = files.find((f) => f.endsWith('.webmanifest'));
if (!manifestFile) {
  fail('No web manifest found in dist/.');
} else {
  const manifest = JSON.parse(read(manifestFile));
  const expect = {
    name: 'AgriSence',
    short_name: 'AgriSence',
    display: 'standalone',
    start_url: '/',
    theme_color: tokens.primary,
    background_color: tokens.canvas,
  };
  for (const [key, value] of Object.entries(expect)) {
    if (manifest[key] !== value)
      fail(
        `Manifest ${key} is ${JSON.stringify(manifest[key])}, expected ${JSON.stringify(value)}.`,
      );
  }
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const size of ['192x192', '512x512']) {
    if (!icons.some((icon) => icon.sizes === size && icon.purpose !== 'maskable'))
      fail(`Manifest has no ${size} icon.`);
  }
  if (!icons.some((icon) => String(icon.purpose ?? '').includes('maskable')))
    fail('Manifest has no maskable icon.');
  for (const icon of icons) {
    if (!files.includes(icon.src)) fail(`Manifest icon ${icon.src} is missing from dist/.`);
  }
}

// 2. Service worker: precache plus navigation fallback only.
const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const apiBaseUrl = (env.VITE_API_BASE_URL ?? '').trim();
const swFiles = files.filter((f) => f === 'sw.js' || /^workbox-[\w-]+\.js$/.test(f));
if (!files.includes('sw.js')) {
  fail('No service worker (sw.js) found in dist/.');
} else {
  const sw = read('sw.js');
  const routes = sw.match(/registerRoute\(/g) ?? [];
  if (routes.length !== 1 || !/registerRoute\(\s*new [\w.]*NavigationRoute\(/.test(sw)) {
    fail(
      `Service worker must register only the navigation fallback route, found ${routes.length} registerRoute call(s).`,
    );
  }
  for (const file of swFiles) {
    const text = read(file);
    if (RUNTIME_STRATEGIES.test(text))
      fail(`${file} contains a runtime caching strategy (${text.match(RUNTIME_STRATEGIES)[0]}).`);
    if (text.includes('/api/v1'))
      fail(`${file} mentions /api/v1: API responses must never be cached.`);
    if (apiBaseUrl && text.includes(apiBaseUrl))
      fail(`${file} contains the API base URL ${apiBaseUrl}.`);
  }
}
if (!apiBaseUrl)
  console.warn(
    '  note: VITE_API_BASE_URL not set for this build; skipped the API address check in the service worker.',
  );

// 3. Development role switcher is tree shaken.
for (const file of files.filter(isText)) {
  if (read(file).includes(DEV_SWITCHER_MARKER))
    fail(`${file} contains the development role switcher.`);
}

// 4. No source maps, no .env files, no non public .env values.
for (const file of files) {
  if (file.endsWith('.map')) fail(`Source map emitted: ${file}.`);
  if (/(^|\/)\.env/.test(file)) fail(`.env file copied into the build: ${file}.`);
}
for (const file of files.filter((f) => /\.(js|mjs)$/.test(f))) {
  if (/sourceMappingURL=/.test(read(file))) fail(`${file} references a source map.`);
}
const envFiles = readdirSync('.').filter((f) => f.startsWith('.env') && f !== '.env.example');
for (const envFile of envFiles) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || m[1].startsWith('VITE_')) continue;
    // The Google client ID is public (VITE_GOOGLE_CLIENT_ID carries the same value into the page).
    if (m[1] === 'GOOGLE_CLIENT_ID' && m[2].trim() === (env.VITE_GOOGLE_CLIENT_ID ?? '').trim())
      continue;
    const value = m[2].replace(/^['"]|['"]$/g, '');
    if (value.length < 6) continue;
    for (const file of files.filter(isText)) {
      if (read(file).includes(value))
        fail(`${file} contains the value of ${m[1]} from ${envFile}.`);
    }
  }
}

// 5. JavaScript size.
const gz = (file) => gzipSync(readFileSync(join(DIST, file))).length;
const kb = (bytes) => (bytes / 1024).toFixed(1);
const jsFiles = files.filter((f) => f.startsWith('assets/') && f.endsWith('.js'));
const chunks = jsFiles
  .map((file) => ({ file, raw: statSync(join(DIST, file)).size, gzip: gz(file) }))
  .sort((a, b) => b.gzip - a.gzip);
const largest = chunks[0];

const html = read('index.html');
const initial = new Set();
for (const m of html.matchAll(/<script[^>]+type="module"[^>]+src="\/?([^"]+)"/g)) initial.add(m[1]);
for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/?([^"]+)"/g))
  initial.add(m[1]);
const initialGzip = [...initial].reduce((sum, file) => sum + gz(file), 0);

console.log('  JS chunks (gzip):');
for (const chunk of chunks) {
  const kind = initial.has(chunk.file) ? 'initial' : 'lazy';
  console.log(
    `    ${kb(chunk.gzip).padStart(7)} kB  ${kind.padEnd(7)}  ${chunk.file} (${kb(chunk.raw)} kB raw)`,
  );
}
if (largest)
  console.log(
    `  largest JS chunk: ${largest.file} ${kb(largest.raw)} kB (${kb(largest.gzip)} kB gzip)`,
  );
console.log(
  `  initial JS: ${initial.size} file(s), ${kb(initialGzip)} kB gzip (budget ${INITIAL_JS_BUDGET_KB} kB)`,
);
if (initial.size === 0) fail('No entry script found in dist/index.html.');
if (initialGzip > INITIAL_JS_BUDGET_KB * 1024) {
  fail(
    `Initial JavaScript is ${kb(initialGzip)} kB gzip, over the ${INITIAL_JS_BUDGET_KB} kB budget.`,
  );
}

// 6. Lazy chunks: each within its own budget; Recharts and the photo helper only in lazy chunks.
const lazyChunks = chunks.filter((chunk) => !initial.has(chunk.file));
const largestLazy = lazyChunks[0];
if (largestLazy)
  console.log(
    `  largest lazy chunk: ${largestLazy.file} ${kb(largestLazy.gzip)} kB gzip (budget ${LAZY_CHUNK_BUDGET_KB} kB)`,
  );
for (const chunk of lazyChunks) {
  if (chunk.gzip > LAZY_CHUNK_BUDGET_KB * 1024)
    fail(
      `Lazy chunk ${chunk.file} is ${kb(chunk.gzip)} kB gzip, over the ${LAZY_CHUNK_BUDGET_KB} kB budget.`,
    );
}
const rechartsChunks = chunks.filter((chunk) => read(chunk.file).includes(RECHARTS_MARKER));
for (const chunk of rechartsChunks) {
  if (initial.has(chunk.file))
    fail(`Recharts is in the initial JavaScript (${chunk.file}); load it lazily.`);
}
if (rechartsChunks.length > 0)
  console.log(`  Recharts: lazy chunk(s) ${rechartsChunks.map((c) => c.file).join(', ')}`);

const imageChunks = chunks.filter((chunk) => read(chunk.file).includes(IMAGE_HELPER_MARKER));
for (const chunk of imageChunks) {
  if (initial.has(chunk.file))
    fail(`The photo helper is in the initial JavaScript (${chunk.file}); load it lazily.`);
}
if (imageChunks.length === 0)
  fail('The photo helper (src/lib/image.js) was not found in the build.');
else console.log(`  Photo helper: lazy chunk(s) ${imageChunks.map((c) => c.file).join(', ')}`);

const buyerChunks = chunks.filter((chunk) => read(chunk.file).includes(BUYER_SCREEN_MARKER));
for (const chunk of buyerChunks) {
  if (initial.has(chunk.file))
    fail(`The buyer screens are in the initial JavaScript (${chunk.file}); load them lazily.`);
}
if (buyerChunks.length === 0) fail('The buyer payment screen was not found in the build.');
else console.log(`  Buyer screens: lazy chunk(s) ${buyerChunks.map((c) => c.file).join(', ')}`);

const adminChunks = chunks.filter((chunk) => read(chunk.file).includes(ADMIN_SCREEN_MARKER));
for (const chunk of adminChunks) {
  if (initial.has(chunk.file))
    fail(`The admin screens are in the initial JavaScript (${chunk.file}); load them lazily.`);
  if (read(chunk.file).includes(RECHARTS_MARKER))
    fail(`The admin screens include Recharts (${chunk.file}); F4 has no chart.`);
}
if (adminChunks.length === 0) fail('The admin screens were not found in the build.');
else console.log(`  Admin screens: lazy chunk(s) ${adminChunks.map((c) => c.file).join(', ')}`);

for (const [name, marker] of Object.entries(AUTH_LAZY_MARKERS)) {
  const found = chunks.filter((chunk) => read(chunk.file).includes(marker));
  for (const chunk of found) {
    if (initial.has(chunk.file))
      fail(`The ${name} are in the initial JavaScript (${chunk.file}); load them lazily.`);
  }
  if (found.length === 0) fail(`The ${name} were not found in the build.`);
  else console.log(`  Account ${name}: lazy chunk(s) ${found.map((c) => c.file).join(', ')}`);
}

// 7. Google's script: never in index.html, and only in a lazy chunk.
if (html.includes(GOOGLE_HOST)) fail('dist/index.html references accounts.google.com.');
for (const file of files.filter((f) => f.endsWith('.html'))) {
  if (read(file).includes(GOOGLE_HOST)) fail(`${file} references accounts.google.com.`);
}
const googleChunks = chunks.filter((chunk) => read(chunk.file).includes(GOOGLE_HOST));
for (const chunk of googleChunks) {
  if (initial.has(chunk.file))
    fail(`Google's script address is in the initial JavaScript (${chunk.file}); load it lazily.`);
}
for (const file of files.filter((f) => isText(f) && !f.startsWith('assets/'))) {
  if (read(file).includes(GOOGLE_HOST)) fail(`${file} references accounts.google.com.`);
}
if (!chunks.some((chunk) => read(chunk.file).includes(GOOGLE_SCRIPT_MARKER)))
  fail('The Google sign in loader (src/lib/google/loadGsi.js) was not found in the build.');
else console.log(`  Google sign in: lazy chunk(s) ${googleChunks.map((c) => c.file).join(', ')}`);
for (const [name, marker] of Object.entries(GOOGLE_LAZY_MARKERS)) {
  const found = chunks.filter((chunk) => read(chunk.file).includes(marker));
  for (const chunk of found) {
    if (initial.has(chunk.file))
      fail(`The ${name} is in the initial JavaScript (${chunk.file}); load it lazily.`);
  }
  if (found.length === 0) fail(`The ${name} was not found in the build.`);
  else console.log(`  ${name}: lazy chunk(s) ${found.map((c) => c.file).join(', ')}`);
}

if (failures.length) {
  console.error('check:build FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('check:build OK');
