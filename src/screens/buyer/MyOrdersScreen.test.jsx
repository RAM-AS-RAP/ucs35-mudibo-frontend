import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { expectNoPriceRequests, recordAll, renderBuyer, serveMyOrders } from '@/test/buyer';
import { queryClient } from '@/lib/queryClient';

/** @type {ReturnType<typeof recordAll>} */
let recorder;
beforeEach(() => {
  recorder = recordAll();
});
afterEach(() => {
  expectNoPriceRequests(recorder);
  recorder.stop();
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
});

const orders = fixtures.buyerOrdersPage.items;
const byId = (/** @type {string} */ id) =>
  /** @type {HTMLElement} */ (document.querySelector(`[data-order-id="${id}"]`));
/** List requests (the badge's limit=1 requests are left out). */
const listRequests = () =>
  recorder
    .of('GET', '/api/v1/orders/mine')
    .filter((r) => r.query.limit === '20')
    .map((r) => r.query);
const badgeRequests = () =>
  recorder.of('GET', '/api/v1/orders/mine').filter((r) => r.query.limit === '1');

async function openMyOrders(path = '/buyer/orders') {
  const utils = renderBuyer(path);
  await screen.findByRole('heading', { name: 'My orders', level: 1 }, { timeout: 5000 });
  await waitFor(() => expect(screen.queryByText('Loading your orders…')).not.toBeInTheDocument());
  return utils;
}

/**
 * `count` waiting orders with distinct ids.
 * @param {number} count
 */
function makeOrders(count) {
  return Array.from({ length: count }, (_, i) => ({
    ...orders[0],
    id: `5c0d1e2f-0000-4000-8000-${String(700000000000 + i).padStart(12, '0')}`,
    reference: `AGR-T${String(i).padStart(5, '0')}`,
  }));
}

describe('MyOrdersScreen', () => {
  it('lists the orders with links, status words and the server totals', async () => {
    await openMyOrders();
    expect(screen.getByTestId('orders-count')).toHaveTextContent('Showing 6 of 6');
    const paid = byId(orders[1].id);
    expect(within(paid).getByRole('link', { name: 'Maize in Nairobi' })).toHaveAttribute(
      'href',
      `/buyer/orders/${orders[1].id}`,
    );
    expect(paid).toHaveTextContent('Paid (test payment)');
    expect(within(paid).getByTestId('order-total')).toHaveTextContent('KES 2,100.00');
    expect(byId(orders[0].id)).toHaveTextContent('Waiting for payment');
    expect(byId(orders[2].id)).toHaveTextContent('Not paid, expired');
    expect(byId(orders[5].id)).toHaveTextContent('Under review');
  });

  it('shows "Continue payment" only when the server says can_pay', async () => {
    await openMyOrders();
    const pending = byId(orders[0].id);
    expect(
      within(pending).getByRole('link', { name: /^Continue payment\s*for order AGR-B7Q2M4$/ }),
    ).toHaveAttribute('href', `/buyer/orders/${orders[0].id}`);
    for (const order of orders.slice(1)) {
      expect(within(byId(order.id)).queryByRole('link', { name: /Continue payment/ })).toBeNull();
    }
  });

  it('hides "Continue payment" for a waiting order the server will not let pay', async () => {
    serveMyOrders([{ ...orders[0], can_pay: false }]);
    await openMyOrders();
    expect(screen.queryByRole('link', { name: /Continue payment/ })).toBeNull();
  });

  it.each([
    ['Paid', 'paid'],
    ['Waiting for payment', 'pending_payment'],
    ['Under review', 'needs_reconciliation'],
  ])('the %s chip sends status=%s and keeps it in the URL', async (label, status) => {
    const user = userEvent.setup();
    const { router } = await openMyOrders();
    await user.click(screen.getByRole('radio', { name: label }));
    await waitFor(() => expect(router.state.location.search).toBe(`?status=${status}`));
    await waitFor(() =>
      expect(listRequests().at(-1)).toEqual({ status, limit: '20', offset: '0' }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('orders-count')).toHaveTextContent('Showing 1 of 1'),
    );
  });

  it('"Not paid" loads all orders and keeps the expired, cancelled and failed ones (as in F2b)', async () => {
    await openMyOrders('/buyer/orders?status=not_paid');
    expect(listRequests().at(-1)).toEqual({ limit: '20', offset: '0' });
    expect(screen.getByRole('radio', { name: 'Not paid' })).toBeChecked();
    const shown = [...document.querySelectorAll('[data-order-id]')].map((el) =>
      el.getAttribute('data-order-id'),
    );
    expect(shown).toEqual([orders[2].id, orders[3].id, orders[4].id]);
    expect(screen.getByTestId('not-paid-note')).toHaveTextContent(
      'Not paid groups expired, cancelled and failed orders from the orders loaded so far. Load more to check older orders.',
    );
    expect(screen.getByTestId('orders-count')).toHaveTextContent(
      '3 not paid among the 6 of 6 orders loaded.',
    );
  });

  it('replaces an invalid status in the URL by All', async () => {
    const { router } = await openMyOrders('/buyer/orders?status=refunded');
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(listRequests().every((q) => !('status' in q))).toBe(true);
  });

  it('loads more with "Showing X of Y"', async () => {
    const user = userEvent.setup();
    serveMyOrders(makeOrders(23));
    await openMyOrders();
    expect(screen.getByTestId('orders-count')).toHaveTextContent('Showing 20 of 23');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(screen.getByTestId('orders-count')).toHaveTextContent('Showing 23 of 23'),
    );
    expect(listRequests().map((q) => q.offset)).toEqual(['0', '20']);
  });

  it('Refresh fetches the list and the waiting count again', async () => {
    const user = userEvent.setup();
    await openMyOrders();
    await waitFor(() => expect(badgeRequests().length).toBeGreaterThanOrEqual(1));
    const lists = listRequests().length;
    const badges = badgeRequests().length;
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(listRequests().length).toBe(lists + 1));
    await waitFor(() => expect(badgeRequests().length).toBe(badges + 1));
  });

  it('never polls', async () => {
    await openMyOrders();
    const count = recorder.requests.length;
    await new Promise((resolve) => setTimeout(resolve, 3500));
    expect(recorder.requests.length).toBe(count);
  });

  it('shows "You have no orders yet." with Browse produce', async () => {
    serveMyOrders([]);
    await openMyOrders();
    expect(screen.getByRole('heading', { name: 'You have no orders yet.' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Browse produce' })).toHaveAttribute(
      'href',
      '/buyer/browse',
    );
  });

  it('shows "No orders with this status." for an empty filter', async () => {
    serveMyOrders([orders[1]]);
    await openMyOrders('/buyer/orders?status=needs_reconciliation');
    expect(screen.getByRole('heading', { name: 'No orders with this status.' })).toBeVisible();
  });

  it('shows an error with Try again and the reference', async () => {
    server.use(
      http.get(apiUrl('/api/v1/orders/mine'), () =>
        errorResponse(500, 'internal_error', { requestId: 'req-mine-500' }),
      ),
    );
    await openMyOrders();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your orders could not be loaded');
    expect(alert).toHaveTextContent('Reference: req-mine-500');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('the "My orders" navigation badge', () => {
  const nav = () => screen.getByRole('navigation', { name: 'Main navigation' });

  it('shows the number of orders waiting for payment with an accessible label', async () => {
    serveMyOrders([orders[0], { ...orders[0], id: '5c0d1e2f-0000-4000-8000-000000000099' }]);
    renderBuyer('/buyer/browse');
    const link = await within(nav()).findByRole('link', {
      name: /^My orders ?, 2 orders waiting for payment$/,
    });
    expect(within(link).getByTestId('nav-count-badge')).toHaveTextContent('2');
    expect(within(link).getByTestId('nav-count-badge')).toHaveAttribute('aria-hidden', 'true');
    const request = badgeRequests()[0];
    expect(request.query).toEqual({ status: 'pending_payment', limit: '1' });
  });

  it('says "1 order" for one', async () => {
    serveMyOrders([orders[0]]);
    renderBuyer('/buyer/browse');
    expect(
      await within(nav()).findByRole('link', {
        name: /^My orders ?, 1 order waiting for payment$/,
      }),
    ).toBeInTheDocument();
  });

  it('shows no badge for zero or when the request fails', async () => {
    serveMyOrders([orders[1]]);
    const first = renderBuyer('/buyer/browse');
    await waitFor(() => expect(badgeRequests().length).toBeGreaterThanOrEqual(1));
    await screen.findByRole('heading', { name: 'Browse produce', level: 1 }, { timeout: 5000 });
    expect(screen.queryByTestId('nav-count-badge')).toBeNull();
    first.unmount();
    queryClient.clear();

    server.use(http.get(apiUrl('/api/v1/orders/mine'), () => errorResponse(500, 'internal_error')));
    renderBuyer('/buyer/browse');
    await screen.findByRole('heading', { name: 'Browse produce', level: 1 }, { timeout: 5000 });
    await waitFor(() => expect(badgeRequests().length).toBeGreaterThanOrEqual(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('nav-count-badge')).toBeNull();
    expect(within(nav()).getByRole('link', { name: 'My orders' })).toBeInTheDocument();
  });

  it('updates when the list is refreshed', async () => {
    const user = userEvent.setup();
    let waiting = [orders[0]];
    server.use(
      http.get(apiUrl('/api/v1/orders/mine'), ({ request }) => {
        const url = new URL(request.url);
        const status = url.searchParams.get('status');
        const all = [...waiting, ...orders.slice(1)];
        const items = status ? all.filter((o) => o.status === status) : all;
        const limit = Number(url.searchParams.get('limit') ?? 20);
        return Response.json({
          items: items.slice(0, limit),
          total: items.length,
          limit,
          offset: 0,
        });
      }),
    );
    renderBuyer('/buyer/orders');
    await within(nav()).findByRole('link', { name: /^My orders ?, 1 order waiting for payment$/ });
    waiting = [
      orders[0],
      { ...orders[0], id: '5c0d1e2f-0000-4000-8000-000000000098' },
      { ...orders[0], id: '5c0d1e2f-0000-4000-8000-000000000097' },
    ];
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(
      await within(nav()).findByRole('link', {
        name: /^My orders ?, 3 orders waiting for payment$/,
      }),
    ).toBeInTheDocument();
  });
});
