import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { loginAs, logout } from '@/test/render';
import { makeOrder, ORDER_ID, recordAll } from '@/test/buyer';
import { queryClient } from '@/lib/queryClient';
import {
  queryKeys,
  useBrowseListings,
  useCancelOrder,
  useCreateOrder,
  useMyBuyerOrders,
  useOrder,
  usePayOrder,
  useWaitingOrdersCount,
} from './index';

const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

afterEach(() => {
  vi.useRealTimers();
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
});

describe('buyer query keys', () => {
  it('hold only non sensitive filters and ids', () => {
    expect(
      queryKeys.browseListings({
        crop: 'beans',
        market: null,
        minPrice: '10',
        maxPrice: null,
        sort: 'newest',
      }),
    ).toEqual([
      'browse',
      'list',
      { crop: 'beans', market: 'all', minPrice: '10', maxPrice: '', sort: 'newest' },
    ]);
    expect(queryKeys.order(ORDER_ID)).toEqual(['order', { id: ORDER_ID }]);
    expect(queryKeys.buyerOrders({ status: null })).toEqual([
      'buyer-orders',
      'list',
      { status: 'all' },
    ]);
    expect(queryKeys.waitingOrdersCount()).toEqual([
      'buyer-orders',
      'count',
      { status: 'pending_payment' },
    ]);
  });
});

describe('buyer reads', () => {
  it('useBrowseListings pages by 20 with the filters in the key', async () => {
    loginAs('buyer');
    const filters = {
      crop: null,
      market: 'Nairobi',
      minPrice: null,
      maxPrice: null,
      sort: 'newest',
    };
    const { result } = renderHook(() => useBrowseListings(/** @type {any} */ (filters)), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].items.map((l) => l.market)).toEqual([
      'Nairobi',
      'Nairobi',
    ]);
    expect(
      queryClient.getQueryData(queryKeys.browseListings(/** @type {any} */ (filters))),
    ).toBeDefined();
  });

  it('useBrowseListings sends nothing while disabled (an invalid price filter)', async () => {
    loginAs('buyer');
    const recorder = recordAll();
    const filters = { crop: null, market: null, minPrice: null, maxPrice: null, sort: 'newest' };
    renderHook(() => useBrowseListings(/** @type {any} */ (filters), { enabled: false }), {
      wrapper,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(recorder.of('GET', '/api/v1/listings')).toHaveLength(0);
    recorder.stop();
  });

  it('useWaitingOrdersCount reads total with limit=1 and status=pending_payment', async () => {
    loginAs('buyer');
    const recorder = recordAll();
    const { result } = renderHook(() => useWaitingOrdersCount(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(1);
    expect(recorder.of('GET', '/api/v1/orders/mine')[0].query).toEqual({
      status: 'pending_payment',
      limit: '1',
    });
    recorder.stop();
  });

  it('useMyBuyerOrders puts the filter in the key and refetches on focus', async () => {
    loginAs('buyer');
    const { result } = renderHook(() => useMyBuyerOrders({ status: 'paid' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].items.map((o) => o.status)).toEqual(['paid']);
    const query = queryClient
      .getQueryCache()
      .find({ queryKey: queryKeys.buyerOrders({ status: 'paid' }) });
    expect(/** @type {any} */ (query)?.options.refetchOnWindowFocus).toBe(true);
  });

  it.each([
    ['in sync', 0],
    ['5 minutes behind', 300_000],
    ['5 minutes ahead', -300_000],
  ])('useOrder measures the server clock offset when the device is %s', async (_name, offset) => {
    loginAs('buyer');
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-20T09:00:00Z') });
    server.use(
      http.get(apiUrl('/api/v1/orders/:orderId'), () =>
        HttpResponse.json(makeOrder({}, { serverNowMs: Date.now() + offset })),
      ),
    );
    const { result } = renderHook(() => useOrder(ORDER_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Date is frozen, so the response "arrives" at the same device time it was made.
    expect(result.current.offsetMs).toBe(offset);
  });
});

describe('buyer writes', () => {
  it('useCreateOrder stores the order and refreshes the lists and the count', async () => {
    loginAs('buyer');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateOrder(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ listingId: fixtures.listingDetail.id, quantity: '2.5' }),
    );
    expect(queryClient.getQueryData(queryKeys.order(ORDER_ID))).toMatchObject({ id: ORDER_ID });
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.buyerOrdersRoot()));
    invalidate.mockRestore();
  });

  it('usePayOrder stores the order without message and prompt', async () => {
    loginAs('buyer');
    const keyRef = {
      current: { key: '0f8fad5b-d9cb-469f-a165-70867728950e', phone: '254712345678' },
    };
    const { result } = renderHook(() => usePayOrder(ORDER_ID, keyRef), { wrapper });
    const answer = await act(() => result.current.mutateAsync());
    expect(answer.message).toBe('Check your phone and enter your M-Pesa PIN.');
    const stored = /** @type {any} */ (queryClient.getQueryData(queryKeys.order(ORDER_ID)));
    expect(stored.payment.status).toBe('initiated');
    expect(stored).not.toHaveProperty('message');
    expect(stored).not.toHaveProperty('prompt');
  });

  it('useCancelOrder stores the cancelled order', async () => {
    loginAs('buyer');
    const { result } = renderHook(() => useCancelOrder(), { wrapper });
    await act(() => result.current.mutateAsync(ORDER_ID));
    expect(queryClient.getQueryData(queryKeys.order(ORDER_ID))).toMatchObject({
      status: 'cancelled',
    });
  });

  it.each([
    ['create', '/api/v1/orders'],
    ['pay', '/api/v1/orders/:orderId/pay'],
    ['cancel', '/api/v1/orders/:orderId/cancel'],
  ])('never retries %s after a network failure or a 500', async (name, path) => {
    loginAs('buyer');
    for (const answer of [() => HttpResponse.error(), () => errorResponse(500, 'internal_error')]) {
      let calls = 0;
      server.use(
        http.post(apiUrl(path), () => {
          calls += 1;
          return answer();
        }),
      );
      const keyRef = {
        current: { key: '0f8fad5b-d9cb-469f-a165-70867728950e', phone: '254712345678' },
      };
      const { result, unmount } = renderHook(
        () => ({
          create: useCreateOrder(),
          pay: usePayOrder(ORDER_ID, keyRef),
          cancel: useCancelOrder(),
        }),
        { wrapper },
      );
      const run = {
        create: () =>
          result.current.create.mutateAsync({
            listingId: fixtures.listingDetail.id,
            quantity: '1',
          }),
        pay: () => result.current.pay.mutateAsync(),
        cancel: () => result.current.cancel.mutateAsync(ORDER_ID),
      }[name];
      await act(() => run().catch(() => {}));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(calls).toBe(1);
      unmount();
    }
  });
});
