import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { loginAs, logout } from '@/test/render';
import { recordRequests } from '@/test/farmer';
import { getSession } from '@/auth/session';
import { queryClient } from '@/lib/queryClient';
import {
  nextOffset,
  queryKeys,
  useCreateListing,
  useMyListingCount,
  useMyListings,
  useMyOrders,
  useRemoveListing,
  useUpdateListing,
} from './index';

const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

afterEach(() => {
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
});

const fields = { crop: 'maize', market: 'Nairobi', quantity_available: '1', price_per_unit: '1' };

describe('listing query keys', () => {
  it('hold only the status filter and listing id, never a token', () => {
    expect(queryKeys.myListings({ status: 'sold_out' })).toEqual([
      'listings',
      'mine',
      'list',
      { status: 'sold_out' },
    ]);
    expect(queryKeys.myListings({ status: null })[3]).toEqual({ status: 'all' });
    expect(queryKeys.myOrders({ status: 'paid', listingId: 'abc' })).toEqual([
      'farmer-orders',
      'list',
      { status: 'paid', listingId: 'abc' },
    ]);
  });

  it('nextOffset uses total', () => {
    expect(nextOffset({ items: [1, 2], total: 5, offset: 0 })).toBe(2);
    expect(nextOffset({ items: [1], total: 5, offset: 4 })).toBeUndefined();
    expect(nextOffset({ items: [], total: 5, offset: 4 })).toBeUndefined();
  });
});

describe('listing hooks', () => {
  it('useMyListings pages with offset and keeps status in the key', async () => {
    loginAs('farmer');
    const recorder = recordRequests();
    const { result } = renderHook(() => useMyListings({ status: 'active' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(recorder.requests[0].query).toEqual({ status: 'active', limit: '20', offset: '0' });
    expect(queryClient.getQueryData(queryKeys.myListings({ status: 'active' }))).toBeDefined();
    expect(result.current.hasNextPage).toBe(false);
  });

  it('useMyOrders refetches on window focus', async () => {
    loginAs('farmer');
    const { result } = renderHook(() => useMyOrders({ status: null, listingId: null }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const query = queryClient.getQueryCache().find({
      queryKey: queryKeys.myOrders({ status: null, listingId: null }),
    });
    expect(/** @type {any} */ (query)?.options.refetchOnWindowFocus).toBe(true);
  });

  it('a 401 from the listings route ends the session', async () => {
    loginAs('farmer');
    server.use(
      http.get(apiUrl('/api/v1/listings/mine'), () => errorResponse(401, 'invalid_credentials')),
    );
    renderHook(() => useMyListings({ status: null }), { wrapper });
    // The session store also clears the query cache, so wait on the session itself.
    await waitFor(() => expect(getSession()).toBeNull());
  });
});

describe('listing writes', () => {
  it.each([
    ['a network error', () => HttpResponse.error()],
    ['a 500', () => errorResponse(500, 'internal_error')],
    ['a 503', () => errorResponse(503, 'service_unavailable')],
  ])('create is never retried after %s', async (_name, answer) => {
    loginAs('farmer');
    let calls = 0;
    server.use(
      http.post(apiUrl('/api/v1/listings'), () => {
        calls += 1;
        return answer();
      }),
    );
    const { result } = renderHook(() => useCreateListing(), { wrapper });
    await act(() => result.current.mutateAsync(/** @type {any} */ (fields)).catch(() => {}));
    expect(calls).toBe(1);
  });

  it('update and remove are never retried', async () => {
    loginAs('farmer');
    let calls = 0;
    server.use(
      http.patch(apiUrl('/api/v1/listings/:id'), () => {
        calls += 1;
        return HttpResponse.error();
      }),
      http.delete(apiUrl('/api/v1/listings/:id'), () => {
        calls += 1;
        return errorResponse(500, 'internal_error');
      }),
    );
    const update = renderHook(() => useUpdateListing(), { wrapper }).result;
    const remove = renderHook(() => useRemoveListing(), { wrapper }).result;
    const id = fixtures.myListingsPage.items[0].id;
    await act(() =>
      update.current.mutateAsync({ id, changes: { price_per_unit: '2' } }).catch(() => {}),
    );
    await act(() => remove.current.mutateAsync(id).catch(() => {}));
    expect(calls).toBe(2);
  });

  it('a successful write refreshes the listings, orders and dashboard counts', async () => {
    loginAs('farmer');
    const recorder = recordRequests();
    const counts = renderHook(() => useMyListingCount('active'), { wrapper }).result;
    await waitFor(() => expect(counts.current.data).toBe(1));
    const create = renderHook(() => useCreateListing(), { wrapper }).result;
    serveTwoActive();
    await act(() => create.current.mutateAsync(/** @type {any} */ (fields)));
    await waitFor(() => expect(counts.current.data).toBe(2));
    expect(
      recorder.requests.filter((r) => r.path === '/api/v1/listings/mine' && r.query.limit === '1'),
    ).toHaveLength(2);
  });
});

function serveTwoActive() {
  const [active] = fixtures.myListingsPage.items;
  server.use(
    http.get(apiUrl('/api/v1/listings/mine'), () =>
      HttpResponse.json({ items: [active], total: 2, limit: 1, offset: 0 }),
    ),
  );
}
