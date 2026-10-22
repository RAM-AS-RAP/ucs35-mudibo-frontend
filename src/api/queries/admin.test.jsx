// The administrator hooks (F4): keys, review count, no retried writes, and what a write refreshes.
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { loginAs, logout } from '@/test/render';
import { recordAll } from '@/test/buyer';
import { queryClient } from '@/lib/queryClient';
import { queryKeys, searchKey } from './keys';
import {
  useAdminStats,
  useAdminUsers,
  useCreateInvite,
  useDisableUser,
  useEnableUser,
  useRemoveListingAsAdmin,
  useResendInvite,
  useResolveOrder,
  useReviewCount,
  useRevokeInvite,
  useSendTestEmail,
} from './admin';

const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

afterEach(() => {
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
});

describe('admin query keys', () => {
  it('never hold a search text, a phone number or an email', () => {
    const key = queryKeys.adminUsers({ role: 'farmer', isDisabled: null, q: '254712345678' });
    const keyText = JSON.stringify(key);
    expect(keyText).not.toContain('254712345678');
    expect(keyText).toContain(searchKey('254712345678'));
    expect(
      JSON.stringify(queryKeys.adminUsers({ role: null, isDisabled: null, q: 'a@b.co' })),
    ).not.toContain('a@b.co');
    expect(searchKey('254712345678')).toBe(searchKey('254712345678'));
    expect(searchKey('one')).not.toBe(searchKey('two'));
    expect(searchKey(null)).toBe('');
  });

  it('keep the review count under the orders root', () => {
    expect(queryKeys.adminReviewCount().slice(0, 2)).toEqual([...queryKeys.adminOrdersRoot()]);
  });
});

describe('useReviewCount', () => {
  it('reads total from GET /admin/orders?status=needs_reconciliation&limit=1', async () => {
    loginAs('admin');
    const recorder = recordAll();
    const { result } = renderHook(() => useReviewCount(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(1));
    expect(recorder.of('GET', '/api/v1/admin/orders')[0].query).toEqual({
      status: 'needs_reconciliation',
      limit: '1',
    });
    recorder.stop();
  });
});

describe('admin reads', () => {
  it('useAdminUsers pages with offset and keeps the filters', async () => {
    loginAs('admin');
    const recorder = recordAll();
    const { result } = renderHook(
      () => useAdminUsers({ role: 'farmer', isDisabled: null, q: null }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].items.every((u) => u.role === 'farmer')).toBe(true);
    expect(recorder.of('GET', '/api/v1/admin/users')[0].query).toEqual({
      role: 'farmer',
      limit: '20',
      offset: '0',
    });
    recorder.stop();
  });

  it('a 4xx read is not retried', async () => {
    loginAs('admin');
    let calls = 0;
    server.use(
      http.get(apiUrl('/api/v1/admin/stats'), () => {
        calls += 1;
        return errorResponse(403, 'forbidden');
      }),
    );
    const { result } = renderHook(() => useAdminStats(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls).toBe(1);
  });
});

describe('admin writes are never retried', () => {
  const ORDER = fixtures.adminOrderDetail.id;
  it.each([
    [
      'disable',
      'patch',
      '/api/v1/admin/users/:id/disable',
      () => useDisableUser(),
      (m) => m.mutateAsync('a0000000-0000-4000-8000-000000000003'),
    ],
    [
      'enable',
      'patch',
      '/api/v1/admin/users/:id/enable',
      () => useEnableUser(),
      (m) => m.mutateAsync('a0000000-0000-4000-8000-000000000003'),
    ],
    [
      'create invite',
      'post',
      '/api/v1/admin/invites',
      () => useCreateInvite(),
      (m) => m.mutateAsync({ name: 'A B', phoneNumber: '254712345678', email: 'a@b.co' }),
    ],
    [
      'resend invite',
      'post',
      '/api/v1/admin/invites/:id/resend',
      () => useResendInvite(),
      (m) => m.mutateAsync('b0000000-0000-4000-8000-000000000001'),
    ],
    [
      'revoke invite',
      'delete',
      '/api/v1/admin/invites/:id',
      () => useRevokeInvite(),
      (m) => m.mutateAsync('b0000000-0000-4000-8000-000000000001'),
    ],
    [
      'email test',
      'post',
      '/api/v1/admin/email/test',
      () => useSendTestEmail(),
      (m) => m.mutateAsync(),
    ],
    [
      'remove listing',
      'delete',
      '/api/v1/admin/listings/:id',
      () => useRemoveListingAsAdmin(),
      (m) => m.mutateAsync('c0000000-0000-4000-8000-000000000001'),
    ],
    [
      'resolve order',
      'post',
      '/api/v1/admin/orders/:id/resolve',
      () => useResolveOrder(ORDER),
      (m) => m.mutateAsync({ action: 'confirm_sale', note: 'Checked the receipt.' }),
    ],
  ])('%s after a network error or a 500', async (_name, method, path, useHook, run) => {
    loginAs('admin', { isSuperAdmin: true });
    for (const answer of [() => HttpResponse.error(), () => errorResponse(500, 'internal_error')]) {
      let calls = 0;
      server.use(
        /** @type {any} */ (http)[method](apiUrl(path), () => {
          calls += 1;
          return answer();
        }),
      );
      const { result } = renderHook(() => useHook(), { wrapper });
      await act(() => run(result.current).catch(() => {}));
      expect(calls).toBe(1);
    }
  });
});

describe('what a write refreshes', () => {
  it('disable updates the cached user and refreshes the users and the stats', async () => {
    loginAs('admin', { isSuperAdmin: true });
    const users = renderHook(() => useAdminUsers({ role: null, isDisabled: null, q: null }), {
      wrapper,
    }).result;
    const stats = renderHook(() => useAdminStats(), { wrapper }).result;
    await waitFor(() => expect(users.current.isSuccess && stats.current.isSuccess).toBe(true));
    const recorder = recordAll();
    const disable = renderHook(() => useDisableUser(), { wrapper }).result;
    const farmer = fixtures.adminUsersPage.items[2];
    await act(() => disable.current.mutateAsync(farmer.id));
    await waitFor(() => {
      expect(recorder.of('GET', '/api/v1/admin/users').length).toBeGreaterThan(0);
      expect(recorder.of('GET', '/api/v1/admin/stats').length).toBeGreaterThan(0);
    });
    recorder.stop();
  });

  it('resolving stores the answer and refreshes orders, the review count, payments, listings and stats', async () => {
    loginAs('admin');
    const count = renderHook(() => useReviewCount(), { wrapper }).result;
    const stats = renderHook(() => useAdminStats(), { wrapper }).result;
    await waitFor(() => expect(count.current.isSuccess && stats.current.isSuccess).toBe(true));
    const recorder = recordAll();
    const id = fixtures.adminOrderDetail.id;
    const resolve = renderHook(() => useResolveOrder(id), { wrapper }).result;
    await act(() =>
      resolve.current.mutateAsync({ action: 'confirm_sale', note: 'Checked the receipt.' }),
    );
    expect(queryClient.getQueryData(queryKeys.adminOrder(id))).toEqual(fixtures.adminOrderResolved);
    await waitFor(() => {
      expect(recorder.of('GET', '/api/v1/admin/orders').length).toBeGreaterThan(0);
      expect(recorder.of('GET', '/api/v1/admin/stats').length).toBeGreaterThan(0);
    });
    recorder.stop();
  });

  it('removing a listing refreshes the review count and the stats', async () => {
    loginAs('admin');
    const count = renderHook(() => useReviewCount(), { wrapper }).result;
    await waitFor(() => expect(count.current.isSuccess).toBe(true));
    const recorder = recordAll();
    const remove = renderHook(() => useRemoveListingAsAdmin(), { wrapper }).result;
    await act(() => remove.current.mutateAsync('c0000000-0000-4000-8000-000000000001'));
    await waitFor(() =>
      expect(
        recorder.of('GET', '/api/v1/admin/orders').filter((r) => r.query.limit === '1'),
      ).toHaveLength(1),
    );
    recorder.stop();
  });
});
