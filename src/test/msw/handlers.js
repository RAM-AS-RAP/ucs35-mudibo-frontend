import { http, HttpResponse } from 'msw';
import { fixtures } from '../fixtures';

export const API_ORIGIN = 'http://localhost:8000';

/** @param {string} path a path from openapi.json, for example /api/v1/health */
export const apiUrl = (path) => `${API_ORIGIN}${path}`;

/**
 * An error response in the backend's envelope.
 * @param {number} status
 * @param {string} code
 * @param {{ message?: string, requestId?: string, headers?: Record<string, string>, extra?: Record<string, unknown> }} [options]
 */
export function errorResponse(
  status,
  code,
  { message = 'Error.', requestId, headers = {}, extra = {} } = {},
) {
  return HttpResponse.json(
    { error: { code, message, ...(requestId ? { request_id: requestId } : {}), ...extra } },
    { status, headers: { ...(requestId ? { 'X-Request-ID': requestId } : {}), ...headers } },
  );
}

/**
 * A 422 validation_error as the backend sends it: `fields` and `details` without the "body" prefix.
 * @param {Array<{ field: string, message: string }>} details
 */
export function validationErrorResponse(details) {
  return errorResponse(422, 'validation_error', {
    message: 'Request validation failed',
    extra: { fields: [...new Set(details.map((d) => d.field))].sort(), details },
  });
}

/**
 * A token response for a role (the login fixture with another role).
 * @param {{ role?: string, mustChangePassword?: boolean, token?: string, isSuperAdmin?: boolean }} [options]
 */
export function tokenFor({
  role = 'farmer',
  mustChangePassword = false,
  token,
  isSuperAdmin = false,
} = {}) {
  return {
    ...fixtures.tokenResponse,
    role,
    is_super_admin: isSuperAdmin,
    must_change_password: mustChangePassword,
    ...(token ? { access_token: token } : {}),
  };
}

/** Markets with price data in the fixtures. Others answer 404 market_not_available. */
const TRENDS = {
  'Nairobi:maize': fixtures.trendNairobiMaize,
  'Kisumu:maize': fixtures.trendKisumuMaize,
  'Nairobi:beans': fixtures.trendNairobiBeans,
  'Kisumu:beans': fixtures.trendKisumuBeans,
};

/** @param {string} iso */
const monthNumber = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return y * 12 + m - 1;
};

/**
 * The trend of a market and crop limited to the last `months` calendar months, as the backend
 * returns it (missing months stay absent).
 * @param {{ market: string, crop: string, months?: number }} params
 */
export function trendFor({ market, crop, months = 24 }) {
  const full = TRENDS[/** @type {keyof typeof TRENDS} */ (`${market}:${crop}`)];
  if (!full) return null;
  const last = monthNumber(full.last_month);
  const points = full.points.filter((p) => monthNumber(p.month) > last - months);
  return {
    ...full,
    points,
    first_month: points[0]?.month ?? null,
    last_month: points[points.length - 1]?.month ?? null,
    count: points.length,
  };
}

/**
 * The fixture forecast for a horizon, relabelled for another market or crop.
 * @param {{ market?: string, crop?: string, horizon?: string }} [params]
 */
export function forecastFor({ market = 'Nairobi', crop = 'maize', horizon = 'one_month' } = {}) {
  const base = horizon === 'two_month' ? fixtures.forecastTwoMonth : fixtures.forecastOneMonth;
  return { ...structuredClone(base), market, crop };
}

/** @param {'no_forecast' | 'stale'} reason */
export function forecastUnavailableResponse(reason) {
  return errorResponse(404, 'forecast_unavailable', {
    message: 'Forecast not available.',
    extra: { reason },
  });
}

export const marketNotAvailableResponse = () =>
  errorResponse(404, 'market_not_available', { message: 'No price data for this market.' });

const KNOWN_MARKETS = new Set(fixtures.markets.map((m) => m.name));

export const priceHandlers = [
  http.get(apiUrl('/api/v1/markets'), () => HttpResponse.json(fixtures.markets)),
  http.get(apiUrl('/api/v1/prices/current'), ({ request }) => {
    const crop = new URL(request.url).searchParams.get('crop');
    if (crop === 'maize') return HttpResponse.json(fixtures.currentPricesMaize);
    if (crop === 'beans') return HttpResponse.json(fixtures.currentPricesBeans);
    return validationErrorResponse([{ field: 'crop', message: 'Invalid crop' }]);
  }),
  http.get(apiUrl('/api/v1/prices/trends'), ({ request }) => {
    const query = new URL(request.url).searchParams;
    const months = Number(query.get('months') ?? 24);
    const trend = trendFor({
      market: query.get('market') ?? '',
      crop: query.get('crop') ?? '',
      months,
    });
    return trend ? HttpResponse.json(trend) : marketNotAvailableResponse();
  }),
  http.get(apiUrl('/api/v1/forecasts'), ({ request }) => {
    const query = new URL(request.url).searchParams;
    const market = query.get('market') ?? '';
    if (!KNOWN_MARKETS.has(market)) return marketNotAvailableResponse();
    return HttpResponse.json(
      forecastFor({
        market,
        crop: query.get('crop') ?? 'maize',
        horizon: query.get('horizon') ?? 'one_month',
      }),
    );
  }),
];

/**
 * A page of items as the backend returns it, honouring `limit` and `offset` in the URL.
 * @template T
 * @param {T[]} items  already filtered
 * @param {URL} url
 */
export function pageOf(items, url) {
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
}

/**
 * GET /listings/mine over a set of listings: `status` filter, newest first as given, paged.
 * @param {Array<{ status: string }>} listings
 * @param {URL} url
 */
export function myListingsResponse(listings, url) {
  const status = url.searchParams.get('status');
  const filtered = status ? listings.filter((l) => l.status === status) : listings;
  return pageOf(filtered, url);
}

/**
 * GET /listings/mine/{id} over a set of listings: the listing in any status, or 404
 * listing_not_found. Returns a Response.
 * @param {Array<{ id: string }>} listings
 * @param {unknown} id
 */
export function myListingResponse(listings, id) {
  const listing = listings.find((l) => l.id === id);
  return listing ? HttpResponse.json(listing) : errorResponse(404, 'listing_not_found');
}

/**
 * GET /listings/mine/orders over a set of orders: one `status`, `listing_id`, paged, with the note.
 * @param {Array<{ status: string, listing_id: string }>} orders
 * @param {URL} url
 * @param {string} [note]
 */
export function myOrdersResponse(orders, url, note = fixtures.farmerOrdersPage.note) {
  const status = url.searchParams.get('status');
  const listingId = url.searchParams.get('listing_id');
  const filtered = orders.filter(
    (o) => (!status || o.status === status) && (!listingId || o.listing_id === listingId),
  );
  return { ...pageOf(filtered, url), note };
}

/**
 * Apply PATCH /listings/{id} form fields to a listing, as the backend does (quantity 0 makes it
 * sold_out, a positive quantity on a sold_out listing makes it active).
 * @param {Record<string, any>} listing
 * @param {FormData} form
 */
export function applyListingChanges(listing, form) {
  const next = { ...listing, updated_at: '2026-10-19T09:00:00Z' };
  const quantity = form.get('quantity_available');
  const price = form.get('price_per_unit');
  if (typeof quantity === 'string') {
    next.quantity_available = Number(quantity);
    if (next.quantity_available === 0) next.status = 'sold_out';
    else if (listing.status === 'sold_out') next.status = 'active';
  }
  if (typeof price === 'string') next.price_per_unit = Number(price);
  if (form.get('image')) next.image_url = 'https://images.agrisence.test/listings/new.jpg';
  if (form.get('remove_image') === 'true') next.image_url = null;
  return next;
}

export const listingHandlers = [
  http.get(apiUrl('/api/v1/listings/mine'), ({ request }) =>
    HttpResponse.json(myListingsResponse(fixtures.myListingsPage.items, new URL(request.url))),
  ),
  http.post(apiUrl('/api/v1/listings'), () =>
    HttpResponse.json(fixtures.listingCreated, { status: 201 }),
  ),
  // The body is not read: under jsdom a handler cannot read a request that holds a File.
  // Tests that need the changes applied use applyListingChanges with text only requests.
  http.patch(apiUrl('/api/v1/listings/:listingId'), ({ params }) => {
    const listing = fixtures.myListingsPage.items.find((l) => l.id === params.listingId);
    if (!listing) return errorResponse(404, 'listing_not_found');
    if (listing.status === 'removed') return errorResponse(409, 'listing_removed');
    return HttpResponse.json(listing);
  }),
  http.delete(apiUrl('/api/v1/listings/:listingId'), () => new HttpResponse(null, { status: 204 })),
  http.get(apiUrl('/api/v1/listings/mine/orders'), ({ request }) =>
    HttpResponse.json(myOrdersResponse(fixtures.farmerOrdersPage.items, new URL(request.url))),
  ),
  // After /mine/orders, so that path is never read as a listing id.
  http.get(apiUrl('/api/v1/listings/mine/:listingId'), ({ params }) =>
    myListingResponse(fixtures.myListingsPage.items, params.listingId),
  ),
];

/** Markets the backend knows for the buyer filter; others answer 422 (as the backend does). */
const BROWSE_MARKETS = new Set(['Nairobi', 'Kisumu', 'Mombasa', 'Nakuru']);

/**
 * GET /listings over a set of listings, as the backend answers it: only active listings with
 * stock; crop, market and price filters; sort; paging. 422 for an unknown market or a minimum
 * above the maximum. Returns a Response.
 * @param {Array<Record<string, any>>} listings
 * @param {URL} url
 */
export function browseResponse(listings, url) {
  const q = url.searchParams;
  const crop = q.get('crop');
  const market = q.get('market');
  const min = q.get('min_price');
  const max = q.get('max_price');
  const sort = q.get('sort') ?? 'newest';
  if (market && !BROWSE_MARKETS.has(market)) {
    return validationErrorResponse([{ field: 'market', message: 'Unknown market.' }]);
  }
  if (min !== null && max !== null && Number(min) > Number(max)) {
    return validationErrorResponse([
      { field: 'min_price', message: 'min_price must not be above max_price.' },
    ]);
  }
  let items = listings.filter(
    (l) =>
      l.status === 'active' &&
      l.quantity_available > 0 &&
      (!crop || l.crop === crop) &&
      (!market || l.market === market) &&
      (min === null || l.price_per_unit >= Number(min)) &&
      (max === null || l.price_per_unit <= Number(max)),
  );
  if (sort === 'price_asc') items = [...items].sort((a, b) => a.price_per_unit - b.price_per_unit);
  if (sort === 'price_desc') items = [...items].sort((a, b) => b.price_per_unit - a.price_per_unit);
  return HttpResponse.json(pageOf(items, url));
}

/**
 * GET /listings/markets over a set of listings, as the backend answers it: the markets with at
 * least one active listing with stock, ordered by name, with their counts.
 * @param {Array<Record<string, any>>} listings
 */
export function buyerMarketsResponse(listings) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const l of listings) {
    if (l.status === 'active' && l.quantity_available > 0) {
      counts.set(l.market, (counts.get(l.market) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, listing_count]) => ({ name, listing_count }));
}

/**
 * GET /orders/mine over a set of orders: one `status`, paged, newest first as given.
 * @param {Array<{ status: string }>} orders
 * @param {URL} url
 */
export function buyerOrdersResponse(orders, url) {
  const status = url.searchParams.get('status');
  return pageOf(status ? orders.filter((o) => o.status === status) : orders, url);
}

/** Every order the default handlers know, by id. */
const KNOWN_ORDERS = [fixtures.orderPending, ...fixtures.buyerOrdersPage.items.slice(1)];

export const buyerHandlers = [
  // Before /listings/:listingId, so "markets" is never read as a listing id.
  http.get(apiUrl('/api/v1/listings/markets'), () => HttpResponse.json(fixtures.buyerMarkets)),
  http.get(apiUrl('/api/v1/listings'), ({ request }) =>
    browseResponse(fixtures.publicListingsPage.items, new URL(request.url)),
  ),
  http.get(apiUrl('/api/v1/listings/:listingId'), ({ params }) => {
    const listing = fixtures.publicListingsPage.items.find((l) => l.id === params.listingId);
    if (!listing) return errorResponse(404, 'listing_not_found');
    return HttpResponse.json({ ...listing, available: listing.quantity_available > 0 });
  }),
  http.post(apiUrl('/api/v1/orders'), () =>
    HttpResponse.json(fixtures.orderPending, { status: 201 }),
  ),
  http.get(apiUrl('/api/v1/orders/mine'), ({ request }) =>
    HttpResponse.json(buyerOrdersResponse(fixtures.buyerOrdersPage.items, new URL(request.url))),
  ),
  http.get(apiUrl('/api/v1/orders/:orderId'), ({ params }) => {
    const order = KNOWN_ORDERS.find((o) => o.id === params.orderId);
    return order ? HttpResponse.json(order) : errorResponse(404, 'order_not_found');
  }),
  http.post(apiUrl('/api/v1/orders/:orderId/pay'), () =>
    HttpResponse.json(fixtures.paymentStarted, { status: 202 }),
  ),
  http.post(apiUrl('/api/v1/orders/:orderId/cancel'), () =>
    HttpResponse.json(fixtures.orderCancelled),
  ),
];

/*
 * Administrator (F4). The default handlers honour the filters and paging as the backend does.
 */

/**
 * GET /admin/users over a set of users: role, is_disabled, q (name, email or phone), paged.
 * @param {Array<Record<string, any>>} users
 * @param {URL} url
 */
export function adminUsersResponse(users, url) {
  const q = url.searchParams;
  const role = q.get('role');
  const disabled = q.get('is_disabled');
  const search = (q.get('q') ?? '').toLowerCase();
  const items = users.filter(
    (u) =>
      (!role || u.role === role) &&
      (disabled === null || String(u.is_disabled) === disabled) &&
      (!search ||
        [u.name, u.email ?? '', u.phone_number].some((v) => v.toLowerCase().includes(search))),
  );
  return pageOf(items, url);
}

/**
 * GET /admin/orders over a set of orders: one status; q is a reference prefix or a buyer name.
 * @param {Array<Record<string, any>>} orders
 * @param {URL} url
 */
export function adminOrdersResponse(orders, url) {
  const q = url.searchParams;
  const status = q.get('status');
  const search = (q.get('q') ?? '').toLowerCase();
  const items = orders.filter(
    (o) =>
      (!status || o.status === status) &&
      (!search ||
        o.reference.toLowerCase().startsWith(search) ||
        o.buyer_name.toLowerCase().includes(search)),
  );
  return pageOf(items, url);
}

/**
 * GET /admin/forecast-accuracy over the fixture: market, crop, horizon, is_backfill and
 * include_pending (default true), paged, with the fixture's summary and note.
 * @param {URL} url
 */
export function accuracyResponse(url) {
  const q = url.searchParams;
  const base = fixtures.forecastAccuracy;
  const backfill = q.get('is_backfill');
  const includePending = q.get('include_pending') !== 'false';
  const items = base.items.filter(
    (i) =>
      (!q.get('market') || i.market === q.get('market')) &&
      (!q.get('crop') || i.crop === q.get('crop')) &&
      (!q.get('horizon') || i.horizon === q.get('horizon')) &&
      (backfill === null || String(i.is_backfill) === backfill) &&
      (includePending || !i.is_pending),
  );
  return { ...pageOf(items, url), summary: base.summary, note: base.note };
}

/**
 * The detail of an order of the admin list: the review fixture for its id, else the list item
 * with no payments, else null.
 * @param {unknown} id
 */
export function adminOrderDetailFor(id) {
  if (id === fixtures.adminOrderDetail.id) return structuredClone(fixtures.adminOrderDetail);
  const order = fixtures.adminOrdersPage.items.find((o) => o.id === id);
  return order ? { ...structuredClone(order), payments: [] } : null;
}

/** @param {Record<string, any>} user @param {boolean} disabled */
export const toggledUser = (user, disabled) => ({
  ...user,
  is_disabled: disabled,
  disabled_at: disabled ? '2026-10-21T10:00:00Z' : null,
  disabled_by_name: disabled ? 'Amina Main' : null,
});

/** @param {unknown} id @param {boolean} disabled */
function toggleUserResponse(id, disabled) {
  const user = fixtures.adminUsersPage.items.find((u) => u.id === id);
  if (!user) return errorResponse(404, 'user_not_found');
  if (user.is_super_admin) return errorResponse(403, 'cannot_modify_super_admin');
  return HttpResponse.json(toggledUser(user, disabled));
}

export const adminHandlers = [
  http.get(apiUrl('/api/v1/admin/stats'), () => HttpResponse.json(fixtures.adminStats)),
  http.get(apiUrl('/api/v1/admin/users'), ({ request }) =>
    HttpResponse.json(adminUsersResponse(fixtures.adminUsersPage.items, new URL(request.url))),
  ),
  http.patch(apiUrl('/api/v1/admin/users/:userId/disable'), ({ params }) =>
    toggleUserResponse(params.userId, true),
  ),
  http.patch(apiUrl('/api/v1/admin/users/:userId/enable'), ({ params }) =>
    toggleUserResponse(params.userId, false),
  ),
  http.get(apiUrl('/api/v1/admin/invites'), ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const items = fixtures.adminInvitesPage.items.filter((i) => !status || i.status === status);
    return HttpResponse.json(pageOf(items, url));
  }),
  http.post(apiUrl('/api/v1/admin/invites'), () =>
    HttpResponse.json(fixtures.inviteSent, { status: 201 }),
  ),
  http.post(apiUrl('/api/v1/admin/invites/:inviteId/resend'), () =>
    HttpResponse.json({ ...fixtures.inviteSent, email_masked: 'p***@example.com' }),
  ),
  http.delete(
    apiUrl('/api/v1/admin/invites/:inviteId'),
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.post(apiUrl('/api/v1/admin/email/test'), () => HttpResponse.json(fixtures.emailCheck)),
  http.get(apiUrl('/api/v1/admin/listings'), ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams;
    const search = (q.get('q') ?? '').toLowerCase();
    const items = fixtures.adminListingsPage.items.filter(
      (l) =>
        (!q.get('status') || l.status === q.get('status')) &&
        (!q.get('crop') || l.crop === q.get('crop')) &&
        (!q.get('market') || l.market === q.get('market')) &&
        (!search || l.farmer_name.toLowerCase().includes(search)),
    );
    return HttpResponse.json(pageOf(items, url));
  }),
  http.delete(
    apiUrl('/api/v1/admin/listings/:listingId'),
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.get(apiUrl('/api/v1/admin/orders'), ({ request }) =>
    HttpResponse.json(adminOrdersResponse(fixtures.adminOrdersPage.items, new URL(request.url))),
  ),
  http.get(apiUrl('/api/v1/admin/orders/:orderId'), ({ params }) => {
    const order = adminOrderDetailFor(params.orderId);
    return order ? HttpResponse.json(order) : errorResponse(404, 'order_not_found');
  }),
  http.post(apiUrl('/api/v1/admin/orders/:orderId/resolve'), () =>
    HttpResponse.json(fixtures.adminOrderResolved),
  ),
  http.get(apiUrl('/api/v1/admin/payments'), ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams;
    const reference = q.get('order_reference');
    const items = fixtures.adminPaymentsPage.items.filter(
      (p) =>
        (!q.get('status') || p.status === q.get('status')) &&
        (!q.get('environment') || p.environment === q.get('environment')) &&
        (!reference || p.order_reference.startsWith(reference)),
    );
    return HttpResponse.json(pageOf(items, url));
  }),
  http.get(apiUrl('/api/v1/admin/payments/:paymentId/events'), ({ params }) =>
    HttpResponse.json({ ...fixtures.paymentEvents, payment_id: params.paymentId }),
  ),
  http.get(apiUrl('/api/v1/admin/forecast-accuracy'), ({ request }) =>
    HttpResponse.json(accuracyResponse(new URL(request.url))),
  ),
];

export const handlers = [
  ...priceHandlers,
  ...listingHandlers,
  ...buyerHandlers,
  ...adminHandlers,
  http.get(apiUrl('/api/v1/health'), () => HttpResponse.json(fixtures.health)),
  http.get(apiUrl('/api/v1/health/db'), () => HttpResponse.json(fixtures.dbHealth)),

  // Authentication: the happy path. Tests override these with server.use().
  http.post(apiUrl('/api/v1/auth/login'), () => HttpResponse.json(fixtures.tokenResponse)),
  http.get(apiUrl('/api/v1/auth/me'), () => HttpResponse.json(fixtures.userMe)),
  http.post(apiUrl('/api/v1/auth/register/farmer'), () =>
    HttpResponse.json(fixtures.registeredUser, { status: 201 }),
  ),
  http.post(apiUrl('/api/v1/auth/register/buyer'), () =>
    HttpResponse.json({ ...fixtures.registeredUser, role: 'buyer' }, { status: 201 }),
  ),
  http.post(apiUrl('/api/v1/auth/change-password'), () =>
    HttpResponse.json(fixtures.passwordChanged),
  ),
  http.post(apiUrl('/api/v1/auth/password-reset/request'), () =>
    HttpResponse.json(fixtures.codeRequested, { status: 202 }),
  ),
  http.post(
    apiUrl('/api/v1/auth/password-reset/confirm'),
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.post(apiUrl('/api/v1/auth/accept-invite'), () =>
    HttpResponse.json(fixtures.adminMe, { status: 201 }),
  ),
  http.post(apiUrl('/api/v1/auth/invite/request-code'), () =>
    HttpResponse.json(fixtures.codeRequested, { status: 202 }),
  ),
];
