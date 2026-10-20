import { afterEach, describe, expect, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { loginAs, logout } from '@/test/render';
import { ApiError, apiErrorFromResponse } from '../errors';
import {
  browseListings,
  cancelOrder,
  createOrder,
  existingOrderId,
  getListing,
  getMyBuyerOrders,
  getOrder,
  payOrder,
} from './index';

afterEach(() => logout());

const ORDER_ID = fixtures.orderPending.id;
const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e';

/**
 * Record every request to a route: method, query, headers and the raw body text.
 * @param {'get' | 'post'} method
 * @param {string} path
 * @param {() => Response | Promise<Response>} respond
 */
function capture(method, path, respond) {
  /** @type {Array<{ query: Record<string, string>, headers: Headers, body: string }>} */
  const seen = [];
  server.use(
    http[method](apiUrl(path), async ({ request }) => {
      seen.push({
        query: Object.fromEntries(new URL(request.url).searchParams),
        headers: request.headers,
        body: await request.text(),
      });
      return respond();
    }),
  );
  return seen;
}

describe('buyer listing endpoints', () => {
  it('browseListings sends only the filters that are set, with the spec names', async () => {
    const seen = capture('get', '/api/v1/listings', () =>
      HttpResponse.json(fixtures.publicListingsPage),
    );
    await browseListings({ limit: 20, offset: 0 });
    await browseListings({
      crop: 'beans',
      market: 'Kisumu',
      minPrice: '10.5',
      maxPrice: '200',
      sort: 'price_asc',
      limit: 20,
      offset: 40,
    });
    expect(seen.map((s) => s.query)).toEqual([
      { limit: '20', offset: '0' },
      {
        crop: 'beans',
        market: 'Kisumu',
        min_price: '10.5',
        max_price: '200',
        sort: 'price_asc',
        limit: '20',
        offset: '40',
      },
    ]);
  });

  it('browseListings sends the token', async () => {
    loginAs('buyer', { token: 'buyer-token' });
    const seen = capture('get', '/api/v1/listings', () =>
      HttpResponse.json(fixtures.publicListingsPage),
    );
    const page = await browseListings();
    expect(page.total).toBe(5);
    expect(seen[0].headers.get('Authorization')).toBe('Bearer buyer-token');
  });

  it('getListing returns the detail with available', async () => {
    await expect(getListing(fixtures.listingDetail.id)).resolves.toMatchObject({
      id: fixtures.listingDetail.id,
      available: true,
    });
  });

  it('getListing throws listing_not_found for a removed or unknown listing', async () => {
    const error = await getListing('7a1b2c3d-0000-4000-8000-999999999999').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'listing_not_found' });
  });
});

describe('order endpoints', () => {
  it('createOrder sends exactly {listing_id, quantity} as JSON, the quantity as a string', async () => {
    const seen = capture('post', '/api/v1/orders', () =>
      HttpResponse.json(fixtures.orderPending, { status: 201 }),
    );
    const order = await createOrder({ listingId: fixtures.listingDetail.id, quantity: '2.5' });
    expect(order.id).toBe(ORDER_ID);
    const body = JSON.parse(seen[0].body);
    expect(Object.keys(body).sort()).toEqual(['listing_id', 'quantity']);
    expect(body).toEqual({ listing_id: fixtures.listingDetail.id, quantity: '2.5' });
    expect(seen[0].headers.get('Content-Type')).toMatch(/application\/json/);
    expect(seen[0].headers.get('Idempotency-Key')).toBeNull();
  });

  it('getOrder, getMyBuyerOrders and cancelOrder use the spec paths', async () => {
    const mine = capture('get', '/api/v1/orders/mine', () =>
      HttpResponse.json(fixtures.buyerOrdersPage),
    );
    await expect(getOrder(ORDER_ID)).resolves.toMatchObject({ id: ORDER_ID });
    await getMyBuyerOrders({ status: 'pending_payment', limit: 1 });
    await getMyBuyerOrders({ limit: 20, offset: 20 });
    expect(mine.map((s) => s.query)).toEqual([
      { status: 'pending_payment', limit: '1' },
      { limit: '20', offset: '20' },
    ]);
    const cancel = capture('post', '/api/v1/orders/:orderId/cancel', () =>
      HttpResponse.json(fixtures.orderCancelled),
    );
    await expect(cancelOrder(ORDER_ID)).resolves.toMatchObject({ status: 'cancelled' });
    expect(cancel[0].body).toBe('');
  });

  it('getOrder throws order_not_found for a missing or foreign order', async () => {
    const error = await getOrder('5c0d1e2f-0000-4000-8000-999999999999').catch((e) => e);
    expect(error).toMatchObject({ status: 404, code: 'order_not_found' });
  });
});

describe('payOrder', () => {
  it('sends the Idempotency-Key header and no body', async () => {
    const seen = capture('post', '/api/v1/orders/:orderId/pay', () =>
      HttpResponse.json(fixtures.paymentStarted, { status: 202 }),
    );
    const result = await payOrder(ORDER_ID, KEY);
    expect(result.message).toBe('Check your phone and enter your M-Pesa PIN.');
    expect(result.prompt).toBe('254*******149');
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get('Idempotency-Key')).toBe(KEY);
    expect(seen[0].body).toBe('');
  });

  it('refuses to send a request without a valid key', async () => {
    const seen = capture('post', '/api/v1/orders/:orderId/pay', () =>
      HttpResponse.json(fixtures.paymentStarted, { status: 202 }),
    );
    for (const key of ['', 'short', 'has space in it', /** @type {any} */ (undefined)]) {
      await expect(payOrder(ORDER_ID, key)).rejects.toBeInstanceOf(TypeError);
    }
    expect(seen).toHaveLength(0);
  });

  it.each([
    [409, 'order_expiring', { reason: 'too_close' }],
    [409, 'max_attempts_reached', {}],
    [429, 'too_many_payment_attempts', {}],
    [502, 'payment_request_failed', {}],
    [503, 'payments_unavailable', {}],
  ])('turns %i %s into an ApiError', async (status, code, extra) => {
    server.use(
      http.post(apiUrl('/api/v1/orders/:orderId/pay'), () =>
        errorResponse(status, code, { extra, headers: { 'Retry-After': '45' } }),
      ),
    );
    const error = await payOrder(ORDER_ID, KEY).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, retryAfter: 45 });
    if ('reason' in extra) expect(error.reason).toBe('too_close');
  });

  it('reports a network failure as network_error (status 0)', async () => {
    server.use(http.post(apiUrl('/api/v1/orders/:orderId/pay'), () => HttpResponse.error()));
    const error = await payOrder(ORDER_ID, KEY).catch((e) => e);
    expect(error).toMatchObject({ status: 0, code: 'network_error' });
  });

  it('reports a slow answer as timeout (status 0)', async () => {
    server.use(
      http.post(apiUrl('/api/v1/orders/:orderId/pay'), async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    const { createApiClient } = await import('../client');
    const client = createApiClient({ timeoutMs: 20 });
    const { error } = await client
      .POST('/api/v1/orders/{order_id}/pay', {
        params: { path: { order_id: ORDER_ID }, header: { 'Idempotency-Key': KEY } },
      })
      .catch((e) => ({ error: e }));
    expect(error).toMatchObject({ status: 0, code: 'timeout' });
  });
});

describe('extra fields on ApiError', () => {
  it('keeps unknown fields of the error object in `extra`', () => {
    const response = new Response(null, { status: 409 });
    const error = apiErrorFromResponse(response, {
      error: {
        code: 'pending_order_exists',
        message: 'Open order.',
        request_id: 'req-1',
        existing_order_id: ORDER_ID,
        something_new: { nested: true },
      },
    });
    expect(error.extra).toEqual({ existing_order_id: ORDER_ID, something_new: { nested: true } });
    // The known fields are not repeated in extra.
    expect(error.extra).not.toHaveProperty('code');
    expect(error.extra).not.toHaveProperty('request_id');
  });

  it('exposes existing_order_id of pending_order_exists to callers', async () => {
    server.use(
      http.post(apiUrl('/api/v1/orders'), () =>
        errorResponse(409, 'pending_order_exists', { extra: { existing_order_id: ORDER_ID } }),
      ),
    );
    const error = await createOrder({ listingId: fixtures.listingDetail.id, quantity: '1' }).catch(
      (e) => e,
    );
    expect(error.extra.existing_order_id).toBe(ORDER_ID);
    expect(existingOrderId(error)).toBe(ORDER_ID);
  });

  it('existingOrderId ignores other codes and values that are not ids', () => {
    expect(
      existingOrderId(
        new ApiError({
          status: 409,
          code: 'insufficient_stock',
          extra: { existing_order_id: ORDER_ID },
        }),
      ),
    ).toBeNull();
    expect(
      existingOrderId(
        new ApiError({
          status: 409,
          code: 'pending_order_exists',
          extra: { existing_order_id: '../../admin' },
        }),
      ),
    ).toBeNull();
    expect(existingOrderId(new Error('x'))).toBeNull();
  });
});
