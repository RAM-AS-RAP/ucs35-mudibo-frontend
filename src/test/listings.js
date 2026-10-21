// Helpers for the listing and order tests (F2b).
import { vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { api } from '@/api/client';
import { server } from './msw/server';
import { apiUrl, myListingResponse, myListingsResponse, myOrdersResponse } from './msw/handlers';
import { fixtures } from './fixtures';

/**
 * Record the FormData bodies the API layer hands to the client for POST and PATCH, while the
 * real request still goes to MSW. Under jsdom, an MSW handler cannot read a request body that
 * holds a jsdom File, so tests inspect the FormData here and the headers on the request.
 * @returns {Array<{ method: 'POST' | 'PATCH', path: string, form: FormData, timeoutMs: unknown, serializer: unknown }>}
 */
export function spyListingWrites() {
  /** @type {Array<{ method: 'POST' | 'PATCH', path: string, form: FormData, timeoutMs: unknown, serializer: unknown }>} */
  const calls = [];
  for (const method of /** @type {const} */ (['POST', 'PATCH'])) {
    const original = api[method];
    vi.spyOn(api, method).mockImplementation(
      /** @type {any} */ (
        (/** @type {string} */ path, /** @type {any} */ init) => {
          if (init?.body instanceof FormData) {
            calls.push({
              method,
              path,
              form: init.body,
              timeoutMs: init.timeoutMs,
              serializer: init.bodySerializer,
            });
          }
          return original.call(api, /** @type {any} */ (path), init);
        }
      ),
    );
  }
  return calls;
}

/**
 * The entries of a FormData as [name, value] pairs, with files as { name, type }.
 * @param {FormData} form
 */
export function formEntries(form) {
  return [...form.entries()].map(([name, value]) => [
    name,
    typeof value === 'string' ? value : { file: value.name, type: value.type },
  ]);
}

/**
 * `count` active maize listings in Nairobi with distinct ids, newest first.
 * @param {number} count
 */
export function makeListings(count) {
  const base = fixtures.myListingsPage.items[0];
  return Array.from({ length: count }, (_, i) => ({
    ...base,
    id: `6f0f2a1e-3b8c-4d5e-9f10-${String(500000000000 + i).padStart(12, '0')}`,
    quantity_available: 10 + i,
    image_url: null,
  }));
}

/**
 * Serve these listings from GET /listings/mine (status filter and paging honoured) and
 * GET /listings/mine/{id}.
 * @param {Array<Record<string, any>>} listings
 */
export function serveListings(listings) {
  server.use(
    http.get(apiUrl('/api/v1/listings/mine'), ({ request }) =>
      HttpResponse.json(myListingsResponse(/** @type {any} */ (listings), new URL(request.url))),
    ),
    http.get(apiUrl('/api/v1/listings/mine/orders'), ({ request }) =>
      HttpResponse.json(myOrdersResponse(fixtures.farmerOrdersPage.items, new URL(request.url))),
    ),
    http.get(apiUrl('/api/v1/listings/mine/:listingId'), ({ params }) =>
      myListingResponse(/** @type {any} */ (listings), params.listingId),
    ),
  );
}

/**
 * Serve these orders from GET /listings/mine/orders.
 * @param {Array<Record<string, any>>} orders
 * @param {string} [note]
 */
export function serveOrders(orders, note) {
  server.use(
    http.get(apiUrl('/api/v1/listings/mine/orders'), ({ request }) =>
      HttpResponse.json(myOrdersResponse(/** @type {any} */ (orders), new URL(request.url), note)),
    ),
  );
}
