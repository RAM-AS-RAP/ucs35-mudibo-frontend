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
 * @param {{ role?: string, mustChangePassword?: boolean, token?: string }} [options]
 */
export function tokenFor({ role = 'farmer', mustChangePassword = false, token } = {}) {
  return {
    ...fixtures.tokenResponse,
    role,
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
];

export const handlers = [
  ...priceHandlers,
  ...listingHandlers,
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
