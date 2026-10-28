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
    // The only body with a role is the one time Google role choice (prompt 6).
    expect(text.match(/body: \{[^}\n]*\brole\b/g)).toEqual([
      'body: { signup_token: signupToken, role',
    ]);
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
      // The pay body is exactly the normalised number (identity v2, prompt 2; F3 sent none).
      expect(text.match(/\bbody\s*:[^\n]*/g)).toEqual(['body: { phone_number: normalized },']);
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

describe('payment number source checks (identity v2, prompt 2)', () => {
  const PAYMENTS = 'src/api/endpoints/payments.js';
  const textOf = (/** @type {string} */ path) =>
    sources.find((source) => source.path === path)?.text ?? '';

  it('builds the pay request only in src/api/endpoints/payments.js', () => {
    const payPath = /\/orders\/\{order_id\}\/pay/;
    expect(offenders(payPath, (path) => path !== PAYMENTS)).toEqual([]);
    expect(textOf(PAYMENTS)).toContain('body: { phone_number: normalized }');
    expect(textOf(PAYMENTS)).toContain("'Idempotency-Key': idempotencyKey");
  });

  it('puts phone_number into a request body only in the pay request', () => {
    // payments.js is the only request builder with a phone number (identity v2, prompt 4:
    // registration and invitations have none); elsewhere it only names a server field.
    const builders = new Set([PAYMENTS]);
    expect(
      offenders(/\bbody\s*:[^\n]*phone_number|phone_number\s*:\s*phone/, (p) => !builders.has(p)),
    ).toEqual([]);
    expect(offenders(/phone_number/, (p) => p.startsWith('src/screens/buyer/'))).toEqual([]);
    expect(offenders(/phone_number/, (p) => p.startsWith('src/components/buyer/'))).toEqual([]);
  });

  it('never writes a phone value to sessionStorage or localStorage', () => {
    expect(offenders(/(session|local)Storage\.setItem\([^)]*phone/i)).toEqual([]);
    // Only the session store persists anything, and its Session type holds no phone number.
    expect(offenders(/\.setItem\(/, (p) => p !== 'src/auth/session.js')).toEqual([]);
    const session = textOf('src/auth/session.js');
    const shape = /@typedef \{object\} Session[\s\S]*?\*\//.exec(session)?.[0] ?? '';
    expect(shape).toContain('accessToken');
    expect(shape).not.toMatch(/phone/i);
  });

  it('keeps the number out of query keys and the URL in the buyer screens', () => {
    expect(offenders(/phone/i, (p) => p === 'src/api/queries/keys.js')).toEqual([]);
    const buyer = (/** @type {string} */ p) =>
      p.startsWith('src/screens/buyer/') || p.startsWith('src/components/buyer/');
    expect(offenders(/setSearchParams|navigate\([^)]*phone|queryKey[^\n]*phone/i, buyer)).toEqual(
      [],
    );
  });

  it('keeps the auth screens, the admin screens (except payments) and auth.js off lib/phone.js', () => {
    const forbidden = (/** @type {string} */ p) =>
      p.startsWith('src/screens/auth/') ||
      p === 'src/api/endpoints/auth.js' ||
      (p.startsWith('src/screens/admin/') &&
        ![
          'src/screens/admin/PaymentsScreen.jsx',
          'src/screens/admin/AdminOrderDetailScreen.jsx',
        ].includes(p));
    for (const { path, text } of sources.filter(({ path }) => forbidden(path))) {
      expect(text, path).not.toMatch(/@\/lib\/(phone|payKey|payErrors|paymentView)'/);
      expect(text, path).not.toMatch(/normalizePhone/);
    }
    // The auth screens share nothing with the buyer components.
    for (const { path, text } of sources.filter(({ path }) =>
      path.startsWith('src/screens/auth/'),
    )) {
      expect(text, path).not.toMatch(/components\/buyer\//);
    }
    // normalizePhone lives in lib/phone.js only.
    expect(textOf('src/lib/validation.js')).not.toMatch(/normalizePhone/);
    expect(textOf('src/lib/phone.js')).toMatch(/export function normalizePhone/);
  });
});

describe('identity v2 source checks (prompt 4: email only accounts)', () => {
  const textOf = (/** @type {string} */ path) =>
    sources.find((source) => source.path === path)?.text ?? '';

  /**
   * Where "phone", "Phone" or "identifier" may still appear: the payment step and the admin
   * payments display. Files that also hold other text list the line patterns allowed there.
   * @type {Record<string, RegExp | true>}
   */
  const PHONE_ALLOWED = {
    'src/api/endpoints/payments.js': true,
    'src/api/endpoints/orders.js': /phone_masked|full phone/,
    'src/api/queries/buyer.js': true,
    'src/api/schema.d.ts': true,
    'src/api/errors.js':
      /payment_in_progress|too_many_payment_attempts|payment attempts for this phone|too_many_phone_numbers|different phone numbers|invalid_phone|phone_required/,
    'src/lib/phone.js': true,
    'src/lib/payKey.js': true,
    'src/lib/waitTime.js': true,
    'src/lib/payErrors.js': true,
    'src/lib/paymentView.js': true,
    'src/lib/orderView.js': true,
    'src/lib/buyerMessages.js': true,
    'src/lib/messages.js': /initiated: '(Waiting for your phone|Initiated, waiting for the phone)'/,
    'src/lib/adminMessages.js':
      /waited more than 10 minutes for the phone|target: 'Phone \(masked\)'/,
    'src/api/queries/keys.js': false,
    'src/components/display/StatusBadge.jsx': /Smartphone/,
    'src/screens/buyer/OrderScreen.jsx': true,
    'src/screens/buyer/MyOrdersScreen.jsx': /Smartphone/,
    'src/screens/admin/PaymentsScreen.jsx': /phone_masked/,
    'src/screens/admin/AdminOrderDetailScreen.jsx': /phone_masked/,
  };

  it('mentions phone or identifier only in the payment step and the admin payments display', () => {
    const word = /phone|Phone|identifier/;
    const found = sources.flatMap(({ path, text }) =>
      text
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => word.test(line))
        .filter(({ line }) => {
          const rule = path.startsWith('src/components/buyer/') ? true : PHONE_ALLOWED[path];
          if (rule === true) return false;
          if (rule instanceof RegExp) return !rule.test(line);
          return true;
        })
        .map(({ i, line }) => `${path}:${i + 1}: ${line.trim()}`),
    );
    expect(found).toEqual([]);
  });

  it('sends no phone_number, identifier or role from the auth endpoints', () => {
    const auth = textOf('src/api/endpoints/auth.js');
    expect(auth).not.toMatch(/phone|identifier/i);
    expect(auth).not.toMatch(/\.\.\.\w+\s*[,}]/); // bodies are never spread from an object
  });

  it('has no console output in src/screens/auth', () => {
    expect(
      offenders(/console\.(log|info|debug|warn|error|table|dir)\b/, (p) =>
        p.startsWith('src/screens/auth/'),
      ),
    ).toEqual([]);
  });

  it('never puts a token, a code or a password into navigation state', () => {
    const where = (/** @type {string} */ p) =>
      p.startsWith('src/screens/') || p.startsWith('src/auth/') || p.startsWith('src/components/');
    expect(
      // A state object never names a secret (state: {...}, state={{...}}, pushState, replaceState).
      offenders(
        /(state\s*[:=]\s*\{\{?|pushState\(|replaceState\()[^\n]*(token|code|password|challenge|registration|credential|nonce|signup)/i,
        where,
      ),
    ).toEqual([]);
    // The only state the sign in screens pass on is {from} (fromState) or the reset email.
    expect(offenders(/state=\{(?!fromState\()/, (p) => p.startsWith('src/screens/auth/'))).toEqual(
      [],
    );
  });

  it('keeps the flow tokens in the in memory flow store only', () => {
    const flow = textOf('src/auth/flow.js');
    expect(
      offenders(
        /sessionStorage|localStorage|indexedDB|document\.cookie|history\./,
        (p) => p === 'src/auth/flow.js',
      ),
    ).toEqual([]);
    expect(flow).toContain('let flow = null;');
    // Only src/auth/auth.js reads the token (getFlow); screens get the view without it.
    expect(
      offenders(/\bgetFlow\(/, (p) => !['src/auth/auth.js', 'src/auth/flow.js'].includes(p)),
    ).toEqual([]);
    expect(
      offenders(/challenge_token|registration_token/, (p) => p.startsWith('src/screens/')),
    ).toEqual([]);
  });

  it('never calls login after a flow that already returned a token', () => {
    for (const path of [
      'src/screens/auth/AcceptInviteScreen.jsx',
      'src/screens/auth/RegisterVerifyScreen.jsx',
      'src/screens/auth/LoginCodeScreen.jsx',
    ]) {
      expect(textOf(path), path).not.toMatch(/\bsignIn\(|\blogin\(|loginRequest/);
    }
  });

  it('loads the registration, code and recovery screens lazily', () => {
    const routes = textOf('src/routes.jsx');
    for (const name of [
      'RegisterScreen',
      'RegisterVerifyScreen',
      'LoginCodeScreen',
      'ForgotPasswordScreen',
      'ResetPasswordScreen',
      'AcceptInviteScreen',
    ]) {
      expect(routes).toContain(`const ${name} = lazy(() => import('@/screens/auth/${name}'));`);
      expect(routes).not.toContain(`import ${name} from`);
    }
  });
});

describe('Google sign in source checks (identity v2, prompt 6)', () => {
  const LOADER = 'src/lib/google/loadGsi.js';
  const textOf = (/** @type {string} */ path) =>
    sources.find((source) => source.path === path)?.text ?? '';
  const isGoogleLib = (/** @type {string} */ p) => p.startsWith('src/lib/google/');

  it('names the Google script address only in src/lib/google/loadGsi.js', () => {
    // Comments included: the address is written in one file only.
    const withHost = sources.filter(({ text }) => text.includes('accounts.google.com'));
    expect(withHost.map(({ path }) => path)).toEqual([LOADER]);
    expect(textOf(LOADER)).toContain("const GSI_SRC = 'https://accounts.google.com/gsi/client';");
  });

  it('has no Google script tag in index.html', () => {
    expect(readFileSync('index.html', 'utf8')).not.toMatch(/google/i);
  });

  it('touches the global Google object only inside src/lib/google/', () => {
    const globalGoogle = /(window|globalThis|self)\??\.google\b|\bgoogle\.accounts\b/;
    expect(offenders(globalGoogle, (p) => !isGoogleLib(p))).toEqual([]);
  });

  it('never calls prompt() (no One Tap)', () => {
    expect(offenders(/\bprompt\(/)).toEqual([]);
  });

  it('has no console output in src/lib/google', () => {
    expect(offenders(/console\.(log|info|debug|warn|error|table|dir)\b/, isGoogleLib)).toEqual([]);
  });

  it('uses no TanStack mutation or query in the Google and password screens', () => {
    const list = [
      'src/auth/useGoogleSignIn.js',
      'src/components/auth/GoogleSignInButton.jsx',
      'src/components/auth/GoogleSignInSlot.jsx',
      'src/screens/auth/GoogleRoleScreen.jsx',
      'src/screens/account/SetPasswordScreen.jsx',
    ];
    for (const path of list) expect(textOf(path), path).not.toBe('');
    expect(offenders(/useMutation|queryKey|useQuery\(/, (p) => list.includes(p))).toEqual([]);
  });

  it('keeps the signup token in the flow store and the nonce out of React state', () => {
    const readers = ['src/auth/auth.js', 'src/auth/flow.js'];
    expect(offenders(/\bgetGoogleFlow\(/, (p) => !readers.includes(p))).toEqual([]);
    expect(offenders(/signup_token|signupToken/, (p) => p.startsWith('src/screens/'))).toEqual([]);
    expect(offenders(/useState\([^)]*nonce|setNonce/i)).toEqual([]);
    // The ID token and the nonce never go into storage, the URL or a query key.
    expect(
      offenders(/(credential|nonce)[^\n]*(setItem|searchParams|setSearchParams|queryKey)/i),
    ).toEqual([]);
  });

  it('reads the client ID only in src/lib/google/config.js', () => {
    expect(offenders(/VITE_GOOGLE_CLIENT_ID/, (p) => p !== 'src/lib/google/config.js')).toEqual([]);
  });

  it('loads the Google button lazily, and the role and account screens from the route table', () => {
    expect(offenders(/^\s*import .*GoogleSignInButton/)).toEqual([]);
    expect(textOf('src/components/auth/GoogleSignInSlot.jsx')).toContain(
      "lazy(() => import('./GoogleSignInButton'))",
    );
    const routes = textOf('src/routes.jsx');
    expect(routes).toContain("lazy(() => import('@/screens/auth/GoogleRoleScreen'))");
    expect(routes).toContain("lazy(() => import('@/screens/account/AccountSecurityScreen'))");
    expect(routes).toContain("lazy(() => import('@/screens/account/SetPasswordScreen'))");
  });
});
