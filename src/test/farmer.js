// Helpers for the farmer screen tests (F2a).
import { delay, http, HttpResponse } from 'msw';
import { server } from './msw/server';
import { apiUrl, errorResponse } from './msw/handlers';
import { loginAs, renderApp } from './render';

/**
 * Sign in as a farmer and render the real route table at `path`.
 * @param {string} path
 */
export function renderFarmer(path) {
  loginAs('farmer');
  return renderApp(path);
}

/**
 * Record every request that reaches MSW (path and query), without changing the responses.
 * @returns {{ requests: Array<{ path: string, query: Record<string, string> }>, stop: () => void }}
 */
export function recordRequests() {
  /** @type {Array<{ path: string, query: Record<string, string> }>} */
  const requests = [];
  /** @param {{ request: Request }} event */
  const listener = ({ request }) => {
    const url = new URL(request.url);
    requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
  };
  server.events.on('request:start', listener);
  return { requests, stop: () => server.events.removeListener('request:start', listener) };
}

/** The price and forecast routes. */
export const FARMER_ROUTES = [
  '/api/v1/markets',
  '/api/v1/prices/current',
  '/api/v1/prices/trends',
  '/api/v1/forecasts',
];

/** Make every price and forecast route hang, to see the loading states. */
export function hangAllPriceRoutes() {
  server.use(
    ...FARMER_ROUTES.map((path) =>
      http.get(apiUrl(path), async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    ),
  );
}

/** Make every price and forecast route answer 500 with a request id. */
export function failAllPriceRoutes(requestId = 'req-farmer-500') {
  server.use(
    ...FARMER_ROUTES.map((path) =>
      http.get(apiUrl(path), () => errorResponse(500, 'internal_error', { requestId })),
    ),
  );
}

/** No markets and no prices. */
export function emptyPriceRoutes() {
  server.use(
    http.get(apiUrl('/api/v1/markets'), () => HttpResponse.json([])),
    http.get(apiUrl('/api/v1/prices/current'), () =>
      HttpResponse.json({ items: [], as_of_note: 'No prices yet.' }),
    ),
  );
}
