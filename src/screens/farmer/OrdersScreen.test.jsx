import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { recordRequests, renderFarmer } from '@/test/farmer';
import { serveOrders } from '@/test/listings';
import { queryClient } from '@/lib/queryClient';

afterEach(() => {
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
});

const orders = fixtures.farmerOrdersPage.items;
const byId = (/** @type {string} */ id) =>
  /** @type {HTMLElement} */ (document.querySelector(`[data-order-id="${id}"]`));

async function openOrders(path = '/farmer/orders') {
  const utils = renderFarmer(path);
  await screen.findByRole('heading', { name: 'Orders', level: 1 });
  await waitFor(() => expect(screen.queryByText('Loading orders…')).not.toBeInTheDocument());
  return utils;
}

describe('OrdersScreen', () => {
  it.each([
    ['paid', 'Paid (test payment)'],
    ['pending_payment', 'Waiting for payment'],
    ['expired', 'Not paid, expired'],
    ['cancelled', 'Cancelled'],
    ['payment_failed', 'Payment failed'],
    ['needs_reconciliation', 'Under review'],
  ])('shows status %s as an icon and the words "%s"', async (status, words) => {
    await openOrders();
    const order = orders.find((o) => o.status === status);
    const badge = /** @type {HTMLElement} */ (
      byId(/** @type {any} */ (order).order_id).querySelector(`[data-status="${status}"]`)
    );
    expect(badge).toHaveTextContent(words);
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('shows the order details with the server total and Nairobi times', async () => {
    await openOrders();
    const paid = byId(orders[0].order_id);
    expect(within(paid).getByRole('heading', { level: 2 })).toHaveTextContent('Maize in Nairobi');
    expect(paid).toHaveTextContent('AGR-7K2P9Q');
    expect(paid).toHaveTextContent('50 kg at KES 42.00 per kg');
    expect(within(paid).getByTestId('order-total')).toHaveTextContent('KES 2,100.00');
    expect(paid).toHaveTextContent('Grace Wanjiru');
    // 06:15 UTC is 09:15 in Nairobi.
    expect(paid).toHaveTextContent('Ordered14 Oct 2026, 09:15');
    expect(paid).toHaveTextContent('Payment completed14 Oct 2026, 09:17');
    expect(paid).toHaveTextContent('Test payment received, receipt SBX4F7H2KQ');
  });

  it("shows the server's total_amount exactly, never quantity times price", async () => {
    await openOrders();
    // 2.5 kg at KES 112.56 would be 281.40; the server's total is 281.
    const order = byId(orders[6].order_id);
    expect(within(order).getByTestId('order-total')).toHaveTextContent('KES 281.00');
    expect(order).not.toHaveTextContent('281.40');
  });

  it('shows the receipt only when present', async () => {
    await openOrders();
    const noReceipt = byId(orders[6].order_id);
    expect(noReceipt).toHaveTextContent('Test payment received');
    expect(noReceipt).not.toHaveTextContent('receipt');
    expect(byId(orders[1].order_id)).not.toHaveTextContent('Test payment received');
  });

  it('shows the response note and the delivery notice', async () => {
    await openOrders();
    expect(screen.getByTestId('orders-note')).toHaveTextContent(fixtures.farmerOrdersPage.note);
    expect(
      screen.getByText(
        'AgriSence does not arrange delivery or share contact details in this prototype. Agree handover directly with the buyer through your own channels.',
      ),
    ).toBeInTheDocument();
  });

  it('falls back to the constant note when the response note is empty', async () => {
    serveOrders(orders, '');
    await openOrders();
    expect(screen.getByTestId('orders-note')).toHaveTextContent(
      'Payments run in a test environment. A paid order is a test confirmation and no real money moves.',
    );
  });

  it('never shows a buyer contact detail, even if the response carried one', async () => {
    serveOrders(
      orders.map((o) => ({
        ...o,
        buyer_phone: '0712345678',
        buyer_email: 'grace@example.com',
        buyer_id: 'b1c2d3e4-0000-4000-8000-000000000000',
      })),
    );
    const { container } = await openOrders();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/(\+?254|0)7\d{8}/);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toContain('b1c2d3e4');
  });

  it.each([
    ['Paid', 'paid'],
    ['Waiting for payment', 'pending_payment'],
    ['Under review', 'needs_reconciliation'],
  ])('the %s chip sends status=%s', async (label, status) => {
    const user = userEvent.setup();
    const recorder = recordRequests();
    const { router } = await openOrders();
    await user.click(screen.getByRole('radio', { name: label }));
    await waitFor(() => expect(router.state.location.search).toBe(`?status=${status}`));
    await waitFor(() =>
      expect(
        recorder.requests.some(
          (r) => r.path === '/api/v1/listings/mine/orders' && r.query.status === status,
        ),
      ).toBe(true),
    );
  });

  it('"Not paid" groups expired, cancelled and failed orders from the loaded pages, with a note', async () => {
    const user = userEvent.setup();
    const recorder = recordRequests();
    await openOrders();
    await user.click(screen.getByRole('radio', { name: 'Not paid' }));
    await waitFor(() => expect(screen.getByTestId('not-paid-note')).toBeInTheDocument());
    const statuses = [...document.querySelectorAll('[data-order-id] [data-status]')].map((el) =>
      el.getAttribute('data-status'),
    );
    expect(statuses.sort()).toEqual(['cancelled', 'expired', 'payment_failed']);
    expect(screen.getByTestId('orders-count')).toHaveTextContent(
      '3 not paid among the 7 of 7 orders loaded.',
    );
    // The API accepts one status, so "Not paid" asks for all orders.
    const orderRequests = recorder.requests.filter(
      (r) => r.path === '/api/v1/listings/mine/orders',
    );
    expect(orderRequests.every((r) => r.query.status === undefined)).toBe(true);
  });

  it('filters by listing with a removable chip', async () => {
    const user = userEvent.setup();
    const recorder = recordRequests();
    const listingId = fixtures.myListingsPage.items[1].id;
    const { router } = await openOrders(`/farmer/orders?listing=${listingId}`);
    expect(screen.getByText('Showing orders for one listing')).toBeInTheDocument();
    expect(
      recorder.requests.find((r) => r.path === '/api/v1/listings/mine/orders')?.query.listing_id,
    ).toBe(listingId);
    expect(screen.getByTestId('orders-count')).toHaveTextContent('Showing 3 of 3');
    await user.click(screen.getByRole('button', { name: 'Show orders for all listings' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() =>
      expect(screen.getByTestId('orders-count')).toHaveTextContent('Showing 7 of 7'),
    );
    expect(screen.getByRole('heading', { name: 'Orders', level: 1 })).toHaveFocus();
  });

  it('drops an invalid listing id or status from the URL', async () => {
    const { router } = await openOrders('/farmer/orders?listing=nope&status=lost');
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('loads more pages', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...orders[0],
      order_id: `9a1b2c3d-0000-4000-8000-${String(100 + i).padStart(12, '0')}`,
      reference: `AGR-${i}`,
    }));
    serveOrders(many);
    await openOrders();
    expect(screen.getByTestId('orders-count')).toHaveTextContent('Showing 20 of 25');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(screen.getByTestId('orders-count')).toHaveTextContent('Showing 25 of 25'),
    );
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('refreshes with the Refresh button (no polling)', async () => {
    const user = userEvent.setup();
    const recorder = recordRequests();
    await openOrders();
    const count = () =>
      recorder.requests.filter((r) => r.path === '/api/v1/listings/mine/orders').length;
    expect(count()).toBe(1);
    serveOrders(orders.slice(0, 2));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(screen.getByTestId('orders-count')).toHaveTextContent('Showing 2 of 2'),
    );
    expect(count()).toBe(2);
  });

  it('shows the empty state', async () => {
    serveOrders([]);
    await openOrders();
    expect(screen.getByRole('heading', { name: 'No orders yet.' })).toBeInTheDocument();
    expect(
      screen.getByText('Orders appear here when a buyer starts paying for one of your listings.'),
    ).toBeInTheDocument();
  });

  it('shows an error with the reference', async () => {
    server.use(
      http.get(apiUrl('/api/v1/listings/mine/orders'), () =>
        errorResponse(500, 'internal_error', { requestId: 'req-orders' }),
      ),
    );
    renderFarmer('/farmer/orders');
    const alert = await screen.findByRole('alert', {}, { timeout: 8000 });
    expect(alert).toHaveTextContent('Orders could not be loaded');
    expect(alert).toHaveTextContent('req-orders');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
