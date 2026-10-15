#!/usr/bin/env node
// npm run check:build (after npm run build). Verifies the production output:
// - the web manifest has the required fields and icons;
// - the service worker has no runtime caching route and does not contain the API address;
// - the development role switcher is not in the build;
// - no source maps or .env content are emitted;
// - the initial JavaScript stays within the performance budget.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { loadEnv } from 'vite';
import { readTokens } from './tokens.mjs';

// Performance budget: initial JavaScript (entry plus modulepreloaded chunks), gzipped.
// Smallholder farmers often use low end phones on slow mobile data; raise this only on purpose.
const INITIAL_JS_BUDGET_KB = 250;

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
const largest = jsFiles
  .map((file) => ({ file, raw: statSync(join(DIST, file)).size, gzip: gz(file) }))
  .sort((a, b) => b.gzip - a.gzip)[0];

const html = read('index.html');
const initial = new Set();
for (const m of html.matchAll(/<script[^>]+type="module"[^>]+src="\/?([^"]+)"/g)) initial.add(m[1]);
for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/?([^"]+)"/g))
  initial.add(m[1]);
const initialGzip = [...initial].reduce((sum, file) => sum + gz(file), 0);

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

if (failures.length) {
  console.error('check:build FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('check:build OK');
