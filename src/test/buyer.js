// Helpers for the buyer screen tests (F3).
import { expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './msw/server';
import { apiUrl, browseResponse, buyerOrdersResponse } from './msw/handlers';
import { fixtures } from './fixtures';
import { loginAs, renderApp } from './render';

export const ORDER_ID = fixtures.orderPending.id;
export const LISTING_ID = fixtures.listingDetail.id;

/**
 * Sign in as a buyer and render the real route table at `path`.
 * @param {string} path
 */
export function renderBuyer(path) {
  loginAs('buyer');
  return renderApp(path);
}

/**
 * Record every request (method, path, query, headers, body text) without changing responses.
 * Bodies are read from a clone so the handlers still see them.
 */
export function recordAll() {
  /** @type {Array<{ method: string, path: string, query: Record<string, string>, headers: Headers, body: Promise<string> }>} */
  const requests = [];
  /** @param {{ request: Request }} event */
  const listener = ({ request }) => {
    const url = new URL(request.url);
    requests.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: request.headers,
      body: request.clone().text(),
    });
  };
  server.events.on('request:start', listener);
  return {
    requests,
    /** @param {string} method @param {RegExp | string} path */
    of: (method, path) =>
      requests.filter(
        (r) =>
          r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)),
      ),
    stop: () => server.events.removeListener('request:start', listener),
  };
}

/** Buyers can never call these (403): no buyer screen may request them. */
export const PRICE_PATHS = /\/api\/v1\/(markets|prices|forecasts)/;

/**
 * Fail if any recorded request went to a price, forecast or markets route.
 * @param {{ requests: Array<{ path: string }> }} recorder
 */
export function expectNoPriceRequests(recorder) {
  expect(recorder.requests.map((r) => r.path).filter((p) => PRICE_PATHS.test(p))).toEqual([]);
}

/**
 * An order like fixtures.orderPending, with its clock set around `serverNowMs` (the server's
 * time): it expires `secondsLeft` seconds later.
 * @param {Record<string, any>} [overrides]
 * @param {{ serverNowMs?: number, secondsLeft?: number }} [clock]
 */
export function makeOrder(overrides = {}, { serverNowMs = Date.now(), secondsLeft = 300 } = {}) {
  return {
    ...structuredClone(fixtures.orderPending),
    server_time: new Date(serverNowMs).toISOString(),
    expires_at: new Date(serverNowMs + secondsLeft * 1000).toISOString(),
    created_at: new Date(serverNowMs).toISOString(),
    ...overrides,
  };
}

/**
 * A payment summary (OrderPaymentSummary) with the fixture's values.
 * @param {string} status
 * @param {Record<string, any>} [overrides]
 */
export function makePayment(status, overrides = {}) {
  return { ...structuredClone(fixtures.paymentStarted.payment), status, ...overrides };
}

/**
 * Serve GET /orders/{id} from a function of the call number (1, 2, ...). Returns the calls.
 * @param {(call: number) => Record<string, any> | Response} answer
 */
export function serveOrder(answer) {
  const calls = { count: 0 };
  server.use(
    http.get(apiUrl('/api/v1/orders/:orderId'), ({ params }) => {
      if (params.orderId === 'mine') return undefined;
      calls.count += 1;
      const value = answer(calls.count);
      return value instanceof Response ? value : HttpResponse.json(value);
    }),
  );
  return calls;
}

/**
 * Serve POST /orders/{id}/pay from a list of answers, one per call (the last one repeats).
 * Records the Idempotency-Key and body of each call.
 * @param {Array<() => Response | Promise<Response>>} answers
 */
export function servePay(answers) {
  /** @type {Array<{ key: string | null, body: string, contentType: string | null }>} */
  const calls = [];
  server.use(
    http.post(apiUrl('/api/v1/orders/:orderId/pay'), async ({ request }) => {
      calls.push({
        key: request.headers.get('Idempotency-Key'),
        body: await request.text(),
        contentType: request.headers.get('Content-Type'),
      });
      return answers[Math.min(calls.length, answers.length) - 1]();
    }),
  );
  return calls;
}

/**
 * Serve these listings from GET /listings (filters, sort and paging honoured).
 * @param {Array<Record<string, any>>} listings
 */
export function serveBrowse(listings) {
  server.use(
    http.get(apiUrl('/api/v1/listings'), ({ request }) =>
      browseResponse(listings, new URL(request.url)),
    ),
  );
}

/**
 * Serve these orders from GET /orders/mine (status filter and paging honoured).
 * @param {Array<Record<string, any>>} orders
 */
export function serveMyOrders(orders) {
  server.use(
    http.get(apiUrl('/api/v1/orders/mine'), ({ request }) =>
      HttpResponse.json(buyerOrdersResponse(/** @type {any} */ (orders), new URL(request.url))),
    ),
  );
}

/**
 * `count` active listings with distinct ids.
 * @param {number} count
 */
export function makeListings(count) {
  const base = fixtures.publicListingsPage.items[0];
  return Array.from({ length: count }, (_, i) => ({
    ...base,
    id: `7a1b2c3d-0000-4000-8000-${String(500000000000 + i).padStart(12, '0')}`,
    price_per_unit: 40 + i,
    image_url: null,
  }));
}
