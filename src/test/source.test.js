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
    // An explicit list (F2b): the listing and order files may show dates (formatDateTime), the
    // price, trend, forecast and dashboard price files and the price guidance may not.
    const RELATIVE_ONLY = [
      'src/screens/farmer/DashboardScreen.jsx',
      'src/screens/farmer/PricesScreen.jsx',
      'src/screens/farmer/ForecastScreen.jsx',
      'src/screens/farmer/params.js',
      'src/screens/farmer/forecastRequest.js',
      'src/components/display/DataTable.jsx',
      'src/components/display/DeltaTag.jsx',
      'src/components/display/ExplainabilityBars.jsx',
      'src/components/display/MarketChips.jsx',
      'src/components/display/PriceCard.jsx',
      'src/components/display/Segmented.jsx',
      'src/components/display/TrendChart.jsx',
      'src/components/display/TrendChartCanvas.jsx',
      'src/components/listings/PriceGuidance.jsx',
      'src/components/listings/useLatestPrice.js',
      'src/components/listings/ListingsSummary.jsx',
      'src/lib/forecast.js',
      'src/lib/relativeTime.js',
      'src/lib/trends.js',
      'src/lib/shapSchema.js',
    ];
    const relativeOnly = (/** @type {string} */ path) => RELATIVE_ONLY.includes(path);

    it('covers the expected files, and every listed file exists', () => {
      for (const path of RELATIVE_ONLY) expect(files).toContain(path);
    });

    it('is the F2a and F2b list, unchanged by the admin module (F4)', () => {
      expect(RELATIVE_ONLY).toHaveLength(20);
      expect(RELATIVE_ONLY.filter((path) => path.includes('/admin/'))).toEqual([]);
      expect(RELATIVE_ONLY.filter((path) => path.startsWith('src/screens/'))).toEqual([
        'src/screens/farmer/DashboardScreen.jsx',
        'src/screens/farmer/PricesScreen.jsx',
        'src/screens/farmer/ForecastScreen.jsx',
        'src/screens/farmer/params.js',
        'src/screens/farmer/forecastRequest.js',
      ]);
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

    it('uses formatDateTime only in the order, listing, buyer and admin files', () => {
      const users = sources
        .filter(({ text }) => /\bformatDateTime\(/.test(text))
        .map(({ path }) => path)
        .filter((path) => path !== 'src/lib/format.js');
      expect(users.length).toBeGreaterThan(0);
      for (const path of users) {
        expect(path).toMatch(
          /^src\/(components\/(orders|listings|buyer|admin)\/|screens\/farmer\/(Orders|MyListings|CreateListing|EditListing)Screen\.jsx$|screens\/(buyer|admin)\/)/,
        );
      }
    });
  });

  describe('listing uploads (F2b)', () => {
    it('builds FormData only in the API layer', () => {
      expect(offenders(/new FormData\(/, (path) => !path.startsWith('src/api/'))).toEqual([]);
    });

    it('creates object URLs only in the photo helper and the photo picker, and revokes each', () => {
      const allowed = ['src/components/listings/PhotoPicker.jsx', 'src/lib/image.js'];
      const creators = sources.filter(({ text }) => /createObjectURL\(/.test(text));
      expect(creators.map(({ path }) => path).sort()).toEqual(allowed);
      for (const { path, text } of creators) {
        expect(text, path).toMatch(/revokeObjectURL\(/);
      }
    });

    it('loads the photo helper only with a dynamic import', () => {
      expect(offenders(/^\s*import .*['"]@\/lib\/image['"]/)).toEqual([]);
      const picker = sources.find(({ path }) => path.endsWith('listings/PhotoPicker.jsx'));
      expect(picker?.text).toMatch(/await import\('@\/lib\/image'\)/);
    });

    it('renders listing photos only through safeImageUrl', () => {
      const withImageUrl = sources.filter(
        ({ text }) => /image_url/.test(text) && /<img/.test(text),
      );
      expect(withImageUrl.length).toBeGreaterThan(0);
      for (const { path, text } of withImageUrl) expect(text, path).toMatch(/safeImageUrl\(/);
    });

    it('never sends unit, status or farmer_id in a listing write', () => {
      const text = sources.find(({ path }) => path === 'src/api/endpoints/listings.js')?.text ?? '';
      const fields = /CREATE_FIELDS = Object\.freeze\(\[([^\]]*)\]/.exec(text)?.[1] ?? '';
      const updates = /UPDATE_FIELDS = Object\.freeze\(\[([^\]]*)\]/.exec(text)?.[1] ?? '';
      expect(fields).toBeTruthy();
      expect(updates).toBeTruthy();
      for (const name of ['unit', 'status', 'farmer_id']) {
        expect(fields).not.toContain(`'${name}'`);
        expect(updates).not.toContain(`'${name}'`);
      }
    });

    it('never retries a listing write automatically', () => {
      const text = sources.find(({ path }) => path === 'src/api/queries/listings.js')?.text ?? '';
      const mutations = text.split('useMutation({').slice(1);
      expect(mutations).toHaveLength(3);
      for (const block of mutations) expect(block).toContain('...writePolicy');
      const policy = sources.find(({ path }) => path === 'src/api/queries/policy.js')?.text ?? '';
      expect(policy).toMatch(/writePolicy = Object\.freeze\(\{ retry: false/);
    });
  });

  describe('buyer checkout and payment (F3)', () => {
    const isBuyerFile = (/** @type {string} */ path) =>
      path.startsWith('src/screens/buyer/') ||
      path.startsWith('src/components/buyer/') ||
      path === 'src/api/queries/buyer.js' ||
      path === 'src/components/layout/NavBadge.jsx';

    it('covers the buyer files', () => {
      expect(files.filter(isBuyerFile).length).toBeGreaterThanOrEqual(12);
    });

    it('sets the Idempotency-Key header only in src/api/endpoints/payments.js', () => {
      const payments = 'src/api/endpoints/payments.js';
      expect(offenders(/Idempotency-Key/i, (path) => path !== payments)).toEqual([]);
      const text = sources.find(({ path }) => path === payments)?.text ?? '';
      expect(text).toContain("header: { 'Idempotency-Key': idempotencyKey }");
      // The pay request carries no body.
      expect(text).not.toMatch(/\bbody\s*:/);
    });

    it('creates random keys (crypto.randomUUID) only in src/lib/idempotency.js', () => {
      expect(offenders(/randomUUID/, (path) => path !== 'src/lib/idempotency.js')).toEqual([]);
    });

    it('sends exactly listing_id and quantity when creating an order', () => {
      const text = sources.find(({ path }) => path === 'src/api/endpoints/orders.js')?.text ?? '';
      expect(text).toContain('{ body: { listing_id: listingId, quantity } }');
    });

    it('clears every interval and timeout in the buyer files', () => {
      for (const { path, text } of sources.filter(({ path }) => isBuyerFile(path))) {
        const count = (/** @type {RegExp} */ re) => (text.match(re) ?? []).length;
        expect(count(/clearInterval\(/g), path).toBeGreaterThanOrEqual(count(/setInterval\(/g));
        expect(count(/clearTimeout\(/g), path).toBeGreaterThanOrEqual(count(/setTimeout\(/g));
      }
    });

    it('never calls prices, forecasts or markets from the buyer files', () => {
      const priceApi =
        /useMarkets|useCurrentPrices|usePriceTrends|useForecast|useLatestPrice|getMarkets|getCurrentPrices|getPriceTrends|getForecast|\/api\/v1\/(markets|prices|forecasts)/;
      expect(offenders(priceApi, isBuyerFile)).toEqual([]);
    });

    it('never asks for a PIN or a password in the buyer files', () => {
      const pinInput = /type=["']password["']|PasswordField|name=["']pin["']/i;
      expect(offenders(pinInput, isBuyerFile)).toEqual([]);
    });

    it('never retries a buyer write automatically', () => {
      const text = sources.find(({ path }) => path === 'src/api/queries/buyer.js')?.text ?? '';
      const mutations = text.split('useMutation({').slice(1);
      expect(mutations).toHaveLength(3);
      for (const block of mutations) expect(block).toContain('...writePolicy');
    });

    it('renders every <img> through safeImageUrl', () => {
      const withImg = sources.filter(
        ({ path, text }) => path.endsWith('.jsx') && /<img\b/.test(text),
      );
      expect(withImg.length).toBeGreaterThan(0);
      for (const { path, text } of withImg) expect(text, path).toMatch(/safeImageUrl\(/);
    });
  });

  describe('administrator screens (F4)', () => {
    const isAdminFile = (/** @type {string} */ path) =>
      path.startsWith('src/screens/admin/') ||
      path.startsWith('src/components/admin/') ||
      path === 'src/api/queries/admin.js' ||
      path === 'src/api/queries/reviewCount.js' ||
      path === 'src/api/endpoints/admin.js' ||
      path === 'src/lib/adminMessages.js';

    it('covers the admin files', () => {
      expect(files.filter(isAdminFile).length).toBeGreaterThanOrEqual(18);
    });

    it('never asks for a password, a code or a token on an admin screen', () => {
      const secretInput =
        /type=["']password["']|PasswordField|CodeInput|one-time-code|name=["'](code|password|token)["']|accessToken|getToken\(/;
      expect(
        offenders(
          secretInput,
          (path) =>
            path.startsWith('src/screens/admin/') || path.startsWith('src/components/admin/'),
        ),
      ).toEqual([]);
    });

    it('never retries an admin write automatically', () => {
      const text = sources.find(({ path }) => path === 'src/api/queries/admin.js')?.text ?? '';
      const mutations = text.split('useMutation({').slice(1);
      expect(mutations).toHaveLength(8);
      for (const block of mutations) expect(block).toContain('...writePolicy');
    });

    it('shows payloads only as text inside <pre> (PayloadView), never as HTML', () => {
      const view =
        sources.find(({ path }) => path === 'src/components/admin/PayloadView.jsx')?.text ?? '';
      expect(view).toMatch(/<pre\b/);
      expect(view).toContain('JSON.stringify(payload, null, 2)');
      expect(offenders(/innerHTML|outerHTML|insertAdjacentHTML|DOMParser/, isAdminFile)).toEqual(
        [],
      );
      const users = sources.filter(({ text }) => /\bpayload\b/.test(text) && /<pre\b/.test(text));
      expect(users.map(({ path }) => path)).toEqual(['src/components/admin/PayloadView.jsx']);
    });

    it('copies to the clipboard only in the payload view, the invites screen and the buyer order card', () => {
      const copiers = sources
        .filter(
          ({ path, text }) => path !== 'src/lib/clipboard.js' && /copyText\(|clipboard/.test(text),
        )
        .map(({ path }) => path)
        .sort();
      expect(copiers).toEqual([
        'src/components/admin/PayloadView.jsx',
        // F3: the buyer copies the order reference.
        'src/components/buyer/OrderSummaryCard.jsx',
        'src/screens/admin/InvitesScreen.jsx',
      ]);
      const invites =
        sources.find(({ path }) => path === 'src/screens/admin/InvitesScreen.jsx')?.text ?? '';
      // The only copied text is the accept invitation page address.
      expect(invites.match(/copyText\(([^)]*)\)/g)).toEqual(['copyText(address)']);
      expect(invites).toContain('return `${window.location.origin}/accept-invite`;');
    });

    it('calls the admin routes only from src/api/endpoints/admin.js', () => {
      expect(
        offenders(/\/api\/v1\/admin/, (path) => path !== 'src/api/endpoints/admin.js'),
      ).toEqual([]);
    });

    it('never imports Recharts in admin code', () => {
      expect(offenders(/recharts|TrendChart/, isAdminFile)).toEqual([]);
    });

    it('loads the admin screens lazily from the route table', () => {
      const routes = sources.find(({ path }) => path === 'src/routes.jsx')?.text ?? '';
      expect(offenders(/^\s*import .*screens\/admin\//)).toEqual([]);
      for (const screen of [
        'AdminDashboardScreen',
        'UsersScreen',
        'InvitesScreen',
        'AdminListingsScreen',
        'AdminOrdersScreen',
        'AdminOrderDetailScreen',
        'PaymentsScreen',
        'ForecastAccuracyScreen',
      ]) {
        expect(routes).toContain(`lazy(() => import('@/screens/admin/${screen}'))`);
      }
    });

    it('guards the invites route with RequireSuperAdmin', () => {
      const routes = sources.find(({ path }) => path === 'src/routes.jsx')?.text ?? '';
      expect(routes).toMatch(/<RequireSuperAdmin>\s*<InvitesScreen \/>\s*<\/RequireSuperAdmin>/);
    });
  });

  it('index.html loads no third party scripts, fonts or stylesheets', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)="(https?:)?\/\//);
  });
});
