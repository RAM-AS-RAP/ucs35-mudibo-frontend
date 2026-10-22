// The administrator endpoint functions (F4): paths, query parameters and exact bodies.
import { afterEach, describe, expect, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { recordAll } from '@/test/buyer';
import { loginAs, logout } from '@/test/render';
import { ApiError } from '../errors';
import { createApiClient } from '../client';
import {
  createInvite,
  disableUser,
  enableUser,
  getAdminListings,
  getAdminOrder,
  getAdminOrders,
  getAdminPayments,
  getAdminStats,
  getAdminUsers,
  getForecastAccuracy,
  getInvites,
  getPaymentEvents,
  removeListingAsAdmin,
  resendInvite,
  resolveOrder,
  revokeInvite,
  sendTestEmail,
  toApiDate,
} from './admin';

/** @type {ReturnType<typeof recordAll>} */
let recorder;
afterEach(() => {
  recorder?.stop();
  logout();
  server.events.removeAllListeners();
});

function record() {
  loginAs('admin', { isSuperAdmin: true });
  recorder = recordAll();
  return recorder;
}

describe('admin reads', () => {
  it('GET /admin/stats', async () => {
    record();
    expect(await getAdminStats()).toEqual(fixtures.adminStats);
    expect(recorder.of('GET', '/api/v1/admin/stats')).toHaveLength(1);
  });

  it('GET /admin/users sends only the given filters', async () => {
    record();
    await getAdminUsers({ role: 'farmer', isDisabled: false, q: 'wanj', limit: 20, offset: 40 });
    await getAdminUsers();
    const [first, second] = recorder.of('GET', '/api/v1/admin/users');
    expect(first.query).toEqual({
      role: 'farmer',
      is_disabled: 'false',
      q: 'wanj',
      limit: '20',
      offset: '40',
    });
    expect(second.query).toEqual({});
  });

  it('GET /admin/invites, /admin/listings and /admin/orders pass their filters', async () => {
    record();
    await getInvites({ status: 'pending', limit: 20, offset: 0 });
    await getAdminListings({
      status: 'removed',
      crop: 'beans',
      market: 'Kisumu',
      farmerId: 'a0000000-0000-4000-8000-000000000003',
      q: 'Wa',
    });
    await getAdminOrders({ status: 'needs_reconciliation', q: 'AGR-R', limit: 1 });
    expect(recorder.of('GET', '/api/v1/admin/invites')[0].query).toEqual({
      status: 'pending',
      limit: '20',
      offset: '0',
    });
    expect(recorder.of('GET', '/api/v1/admin/listings')[0].query).toEqual({
      status: 'removed',
      crop: 'beans',
      market: 'Kisumu',
      farmer_id: 'a0000000-0000-4000-8000-000000000003',
      q: 'Wa',
    });
    expect(recorder.of('GET', '/api/v1/admin/orders')[0].query).toEqual({
      status: 'needs_reconciliation',
      q: 'AGR-R',
      limit: '1',
    });
  });

  it('GET /admin/payments sends dates as YYYY-MM-DD', async () => {
    record();
    await getAdminPayments({
      status: 'initiated',
      orderReference: 'AGR-W41T',
      environment: 'sandbox',
      createdFrom: '2026-10-01',
      createdTo: new Date(Date.UTC(2026, 9, 21, 23, 0)),
    });
    expect(recorder.of('GET', '/api/v1/admin/payments')[0].query).toEqual({
      status: 'initiated',
      order_reference: 'AGR-W41T',
      environment: 'sandbox',
      created_from: '2026-10-01',
      created_to: '2026-10-21',
    });
  });

  it('toApiDate keeps only YYYY-MM-DD values', () => {
    expect(toApiDate('2026-10-01')).toBe('2026-10-01');
    expect(toApiDate('01/10/2026')).toBeNull();
    expect(toApiDate(new Date('invalid'))).toBeNull();
    expect(toApiDate(null)).toBeNull();
  });

  it('GET /admin/forecast-accuracy always sends include_pending', async () => {
    record();
    await getForecastAccuracy({
      market: 'Nairobi',
      crop: 'maize',
      horizon: 'one_month',
      isBackfill: true,
      includePending: false,
    });
    await getForecastAccuracy();
    const [first, second] = recorder.of('GET', '/api/v1/admin/forecast-accuracy');
    expect(first.query).toEqual({
      market: 'Nairobi',
      crop: 'maize',
      horizon: 'one_month',
      is_backfill: 'true',
      include_pending: 'false',
    });
    expect(second.query).toEqual({ include_pending: 'true' });
  });

  it('GET /admin/orders/{id} and /admin/payments/{id}/events', async () => {
    record();
    expect(await getAdminOrder(fixtures.adminOrderDetail.id)).toEqual(fixtures.adminOrderDetail);
    const events = await getPaymentEvents('e0000000-0000-4000-8000-000000000002');
    expect(events.items).toHaveLength(2);
    expect(recorder.requests.map((r) => r.path)).toEqual([
      `/api/v1/admin/orders/${fixtures.adminOrderDetail.id}`,
      '/api/v1/admin/payments/e0000000-0000-4000-8000-000000000002/events',
    ]);
  });

  it('a 404 order_not_found is an ApiError', async () => {
    record();
    await expect(getAdminOrder('d0000000-0000-4000-8000-00000000ffff')).rejects.toMatchObject({
      status: 404,
      code: 'order_not_found',
    });
  });
});

describe('admin writes', () => {
  it('disable and enable send PATCH with an empty body', async () => {
    record();
    const id = fixtures.adminUsersPage.items[2].id;
    expect((await disableUser(id)).is_disabled).toBe(true);
    expect((await enableUser(id)).is_disabled).toBe(false);
    const calls = recorder.requests;
    expect(calls.map((r) => `${r.method} ${r.path}`)).toEqual([
      `PATCH /api/v1/admin/users/${id}/disable`,
      `PATCH /api/v1/admin/users/${id}/enable`,
    ]);
    expect(await calls[0].body).toBe('');
    expect(await calls[1].body).toBe('');
  });

  it('createInvite sends exactly {name, phone_number, email}', async () => {
    record();
    const sent = await createInvite({
      name: 'New Admin',
      phoneNumber: '254712345678',
      email: 'new@example.com',
    });
    expect(sent).toEqual(fixtures.inviteSent);
    const [call] = recorder.of('POST', '/api/v1/admin/invites');
    expect(JSON.parse(await call.body)).toEqual({
      name: 'New Admin',
      phone_number: '254712345678',
      email: 'new@example.com',
    });
  });

  it('resend, revoke and the email test send no body', async () => {
    record();
    const id = 'b0000000-0000-4000-8000-000000000001';
    await resendInvite(id);
    await expect(revokeInvite(id)).resolves.toBeUndefined();
    expect(await sendTestEmail()).toEqual({ email_sent: true });
    expect(recorder.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST /api/v1/admin/invites/${id}/resend`,
      `DELETE /api/v1/admin/invites/${id}`,
      'POST /api/v1/admin/email/test',
    ]);
    for (const call of recorder.requests) expect(await call.body).toBe('');
  });

  it('removeListingAsAdmin sends DELETE /admin/listings/{id}', async () => {
    record();
    await expect(
      removeListingAsAdmin('c0000000-0000-4000-8000-000000000001'),
    ).resolves.toBeUndefined();
    expect(
      recorder.of('DELETE', '/api/v1/admin/listings/c0000000-0000-4000-8000-000000000001'),
    ).toHaveLength(1);
  });

  it('resolveOrder sends exactly {action, note}', async () => {
    record();
    const order = await resolveOrder(fixtures.adminOrderDetail.id, {
      action: 'void_order',
      note: 'Buyer called; the payment was reversed.',
    });
    expect(order.resolution?.action).toBe('confirm_sale');
    const [call] = recorder.of(
      'POST',
      `/api/v1/admin/orders/${fixtures.adminOrderDetail.id}/resolve`,
    );
    expect(JSON.parse(await call.body)).toEqual({
      action: 'void_order',
      note: 'Buyer called; the payment was reversed.',
    });
  });
});

describe('admin errors', () => {
  it('carries the category of email_failed in ApiError.extra.category', async () => {
    server.use(
      http.post(apiUrl('/api/v1/admin/email/test'), () =>
        errorResponse(502, 'email_failed', {
          extra: { category: 'auth_failed' },
          requestId: 'req-1',
        }),
      ),
    );
    record();
    const error = await sendTestEmail().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'email_failed', requestId: 'req-1' });
    expect(error.extra.category).toBe('auth_failed');
  });

  it('reads Retry-After of a 429 resend_cooldown', async () => {
    server.use(
      http.post(apiUrl('/api/v1/admin/invites/:id/resend'), () =>
        errorResponse(429, 'resend_cooldown', { headers: { 'Retry-After': '37' } }),
      ),
    );
    record();
    const error = await resendInvite('b0000000-0000-4000-8000-000000000001').catch((e) => e);
    expect(error).toMatchObject({ status: 429, code: 'resend_cooldown', retryAfter: 37 });
  });

  it.each([
    [403, 'cannot_modify_super_admin'],
    [403, 'cannot_disable_self'],
    [403, 'forbidden'],
    [404, 'user_not_found'],
  ])('passes %s %s through as an ApiError', async (status, code) => {
    server.use(
      http.patch(apiUrl('/api/v1/admin/users/:id/disable'), () => errorResponse(status, code)),
    );
    record();
    await expect(disableUser('a0000000-0000-4000-8000-000000000003')).rejects.toMatchObject({
      status,
      code,
    });
  });

  it('a timeout becomes code timeout (the caller never resends)', async () => {
    server.use(
      http.post(apiUrl('/api/v1/admin/orders/:id/resolve'), async () => {
        await delay(200);
        return HttpResponse.json(fixtures.adminOrderResolved);
      }),
    );
    loginAs('admin');
    const client = createApiClient({ baseUrl: 'http://localhost:8000', timeoutMs: 20 });
    const result = await client
      .POST('/api/v1/admin/orders/{order_id}/resolve', {
        params: { path: { order_id: fixtures.adminOrderDetail.id } },
        body: { action: 'confirm_sale', note: 'Checked the receipt.' },
      })
      .catch((e) => e);
    expect(result).toMatchObject({ code: 'timeout', status: 0 });
  });
});
