// Static checks over application source in src/ (tests and test helpers are excluded).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = 'src';

/** @returns {string[]} */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(SRC)
  .map((path) => relative('.', path).split(sep).join('/'))
  .filter((path) => /\.(js|jsx|css)$/.test(path))
  .filter((path) => !path.startsWith('src/test/') && !/\.test\.(js|jsx)$/.test(path));

const sources = files.map((path) => ({ path, text: readFileSync(path, 'utf8') }));

/**
 * @param {RegExp} pattern
 * @param {(path: string) => boolean} [where]
 */
function offenders(pattern, where = () => true) {
  return sources
    .filter(({ path }) => where(path))
    .flatMap(({ path, text }) =>
      text
        .split('\n')
        .map((line, i) => ({ line, i }))
        // Code only: comment lines may name what is forbidden.
        .filter(({ line }) => !/^\s*(\/\/|\/\*|\*)/.test(line))
        .filter(({ line }) => pattern.test(line))
        .map(({ i, line }) => `${path}:${i + 1}: ${line.trim()}`),
    );
}

const inAuthOrApi = (path) => path.startsWith('src/auth/') || path.startsWith('src/api/');

describe('source checks', () => {
  it('scans the application source', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files).toContain('src/api/client.js');
  });

  it('never renders raw HTML', () => {
    expect(offenders(/dangerouslySetInnerHTML/)).toEqual([]);
  });

  it('never uses localStorage anywhere', () => {
    expect(offenders(/localStorage/)).toEqual([]);
  });

  it('never sends a role in a registration request', () => {
    // The register body is built from named fields only (src/api/endpoints/auth.js).
    const isAuthEndpoints = (path) => path === 'src/api/endpoints/auth.js';
    expect(offenders(/\brole\s*:|\['role'\]|\["role"\]|\.role\s*=/, isAuthEndpoints)).toEqual([]);
    const text = sources.find(({ path }) => path === 'src/api/endpoints/auth.js')?.text ?? '';
    expect(text).toMatch(/export function buildRegisterBody/);
    // The register endpoints receive only what buildRegisterBody returns.
    for (const route of ['register/farmer', 'register/buyer']) {
      expect(text).toContain(`'/api/v1/auth/${route}', { body: buildRegisterBody(fields) }`);
    }
  });

  it('keeps credentials out of TanStack mutations and query keys in the auth screens', () => {
    const authScreens = (path) => path.startsWith('src/screens/auth/');
    expect(offenders(/useMutation|useQuery|queryKey/, authScreens)).toEqual([]);
  });

  it('never uses eval or new Function', () => {
    expect(offenders(/\beval\(|new Function\(/)).toEqual([]);
  });

  it('has no hard coded hex colours outside tokens.css', () => {
    const hex = /(^|[^\w&])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
    expect(offenders(hex, (path) => path !== 'src/styles/tokens.css')).toEqual([]);
  });

  it('calls fetch or XMLHttpRequest only inside src/api', () => {
    const outsideApi = (path) => !path.startsWith('src/api/');
    expect(offenders(/(^|[^\w.])fetch\(|XMLHttpRequest/, outsideApi)).toEqual([]);
  });

  it('has no console output in src/auth and src/api', () => {
    expect(offenders(/console\.(log|info|debug|warn|error|table|dir)\b/, inAuthOrApi)).toEqual([]);
  });

  it('has no rgb(), hsl() or oklch() colours outside the style sheets', () => {
    const colourFn = /\b(rgba?|hsla?|oklch|oklab)\(/;
    expect(offenders(colourFn, (path) => !path.endsWith('.css'))).toEqual([]);
  });

  it('draws chart series only with the chart tokens, through CSS variables', () => {
    const canvas = sources.find(({ path }) => path.endsWith('display/TrendChartCanvas.jsx'));
    expect(canvas?.text).toBeDefined();
    for (const token of ['--chart-1', '--chart-2', '--chart-3', '--chart-4']) {
      expect(canvas?.text).toContain(`var(${token})`);
    }
    const tokensCss = readFileSync('src/styles/tokens.css', 'utf8');
    for (const token of ['--chart-1', '--chart-2', '--chart-3', '--chart-4']) {
      expect(tokensCss).toMatch(new RegExp(`${token}:\\s*#[0-9a-f]{6};`, 'i'));
    }
  });

  it('imports Recharts only in the chart canvas, which is loaded lazily', () => {
    const isCanvas = (path) => path.endsWith('display/TrendChartCanvas.jsx');
    expect(offenders(/from ['"]recharts['"]/, (path) => !isCanvas(path))).toEqual([]);
    // Never a static import of the canvas: only import('./TrendChartCanvas').
    expect(offenders(/^\s*import .*TrendChartCanvas/)).toEqual([]);
    const chart = sources.find(({ path }) => path.endsWith('display/TrendChart.jsx'));
    expect(chart?.text).toMatch(/lazy\(\(\) => import\('\.\/TrendChartCanvas'\)\)/);
  });

  describe('farmer price, trend and forecast files show no absolute dates', () => {
    const relativeOnly = (path) =>
      path.startsWith('src/screens/farmer/') ||
      path.startsWith('src/components/display/') ||
      ['src/lib/forecast.js', 'src/lib/relativeTime.js', 'src/lib/trends.js'].includes(path);

    it('covers the expected files', () => {
      for (const path of [
        'src/screens/farmer/ForecastScreen.jsx',
        'src/screens/farmer/PricesScreen.jsx',
        'src/screens/farmer/DashboardScreen.jsx',
        'src/components/display/PriceCard.jsx',
        'src/lib/relativeTime.js',
        'src/lib/forecast.js',
      ]) {
        expect(files).toContain(path);
      }
    });

    it.each([
      ['formatMonth or formatDateTime', /\bformat(Month|DateTime)\b/],
      ['new Date(', /new Date\(/],
      ['toLocaleDateString', /toLocaleDateString/],
      ['toLocaleString', /toLocaleString/],
      ['Intl.DateTimeFormat', /Intl\.DateTimeFormat/],
      [
        'month names',
        /['"`](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)['"`]/,
      ],
    ])('never uses %s', (_name, pattern) => {
      expect(offenders(pattern, relativeOnly)).toEqual([]);
    });
  });

  it('index.html loads no third party scripts, fonts or stylesheets', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)="(https?:)?\/\//);
  });
});
