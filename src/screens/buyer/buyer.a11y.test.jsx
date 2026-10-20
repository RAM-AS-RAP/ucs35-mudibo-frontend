// Accessibility of the buyer screens (F3) in every state: loading, empty, error, success,
// dialog open, and each payment panel kind. Also: no broken values ("undefined", "NaN", "null").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { expectNoAxeViolations } from '@/test/axe';
import { logout } from '@/test/render';
import { BROKEN_VALUE_PATTERNS, collectUserFacingStrings } from '@/test/userFacing';
import {
  expectNoPriceRequests,
  makeOrder,
  makePayment,
  ORDER_ID,
  recordAll,
  renderBuyer,
  serveBrowse,
  serveMyOrders,
  serveOrder,
} from '@/test/buyer';
import { queryClient } from '@/lib/queryClient';

vi.mock('sonner', async (importOriginal) => {
  const actual = /** @type {typeof import('sonner')} */ (await importOriginal());
  return {
    ...actual,
    toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  };
});

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

/** Never "undefined", "NaN" or "null" on screen. */
function expectNoBrokenValues(/** @type {Element} */ root) {
  const strings = collectUserFacingStrings(root);
  for (const pattern of BROKEN_VALUE_PATTERNS) {
    expect(strings.filter((s) => pattern.test(s))).toEqual([]);
  }
}

/** @param {Element} container */
async function check(container) {
  expectNoBrokenValues(container);
  await expectNoAxeViolations(container, { page: true });
}

/** @param {string} path @param {'get' | 'post'} [method] */
function hang(path, method = 'get') {
  server.use(
    http[method](apiUrl(path), async () => {
      await delay('infinite');
      return HttpResponse.json({});
    }),
  );
}

/** @param {string} path */
function fail(path) {
  server.use(
    http.get(apiUrl(path), () => errorResponse(500, 'internal_error', { requestId: 'req-a11y' })),
  );
}

/** @param {string} title */
const heading = (title) =>
  screen.findByRole('heading', { name: title, level: 1 }, { timeout: 5000 });

describe('BrowseScreen accessibility', () => {
  it('loading', async () => {
    hang('/api/v1/listings');
    const { container } = renderBuyer('/buyer/browse');
    await heading('Browse produce');
    expect(screen.getByRole('status')).toHaveTextContent('Loading produce…');
    await check(container);
  });

  it('success', async () => {
    const { container } = renderBuyer('/buyer/browse');
    await heading('Browse produce');
    await screen.findByText('Showing 5 of 5');
    await check(container);
  });

  it('empty and filtered empty', async () => {
    serveBrowse([]);
    const empty = renderBuyer('/buyer/browse');
    await screen.findByText('No produce is listed right now. Please check again soon.', undefined, {
      timeout: 5000,
    });
    await check(empty.container);
    empty.unmount();
    const filtered = renderBuyer('/buyer/browse?crop=beans');
    await screen.findByText('No listings match these filters.');
    await check(filtered.container);
  });

  it('error and an invalid price', async () => {
    fail('/api/v1/listings');
    const user = userEvent.setup();
    const { container } = renderBuyer('/buyer/browse');
    await screen.findByText('Produce could not be loaded', undefined, { timeout: 5000 });
    await user.type(screen.getByLabelText('Highest price (KES per kg)'), 'abc');
    await screen.findByTestId('price-message');
    await check(container);
  });
});

describe('ListingDetailScreen accessibility', () => {
  const path = `/buyer/listings/${fixtures.listingDetail.id}`;

  it('loading', async () => {
    hang('/api/v1/listings/:listingId');
    const { container } = renderBuyer(path);
    await heading('Produce details');
    await check(container);
  });

  it('success, a quantity error and the minimum message', async () => {
    const user = userEvent.setup();
    const { container } = renderBuyer(path);
    await heading('Produce details');
    await screen.findByText('Beans in Kisumu');
    await check(container);
    await user.clear(screen.getByLabelText('Quantity (kg)'));
    await user.type(screen.getByLabelText('Quantity (kg)'), '0.05');
    await screen.findByText('Order at least 1 kg.');
    await check(container);
  });

  it('sold out, not available and error', async () => {
    server.use(
      http.get(apiUrl('/api/v1/listings/:listingId'), () =>
        HttpResponse.json({ ...fixtures.listingDetail, available: false, quantity_available: 0 }),
      ),
    );
    const soldOut = renderBuyer(path);
    await screen.findByTestId('sold-out', undefined, { timeout: 5000 });
    await check(soldOut.container);
    soldOut.unmount();
    queryClient.clear();

    server.use(
      http.get(apiUrl('/api/v1/listings/:listingId'), () =>
        errorResponse(404, 'listing_not_found'),
      ),
    );
    const gone = renderBuyer(path);
    await screen.findByText('This listing is no longer available.');
    await check(gone.container);
    gone.unmount();
    queryClient.clear();

    fail('/api/v1/listings/:listingId');
    const failed = renderBuyer(path);
    await screen.findByText('The listing could not be loaded');
    await check(failed.container);
  });

  it('a create error summary', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/api/v1/orders'), () => errorResponse(409, 'too_many_pending_orders')),
    );
    const { container } = renderBuyer(path);
    await screen.findByText('Beans in Kisumu', undefined, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: /Continue to checkout/ }));
    await screen.findByRole('alert', { name: 'The order was not created' });
    await check(container);
  });
});

describe('OrderScreen accessibility', () => {
  const path = `/buyer/orders/${ORDER_ID}`;

  it('loading, not found and error', async () => {
    hang('/api/v1/orders/:orderId');
    const loading = renderBuyer(path);
    await heading('Your order');
    await check(loading.container);
    loading.unmount();
    queryClient.clear();

    server.use(
      http.get(apiUrl('/api/v1/orders/:orderId'), () => errorResponse(404, 'order_not_found')),
    );
    const missing = renderBuyer(path);
    await screen.findByText('This order could not be found.');
    await check(missing.container);
    missing.unmount();
    queryClient.clear();

    fail('/api/v1/orders/:orderId');
    const failed = renderBuyer(path);
    await screen.findByText('The order could not be loaded');
    await check(failed.container);
  });

  it.each([
    ['pay_ready', {}, {}],
    ['too_close', { can_pay: false }, { secondsLeft: 60 }],
    ['max_attempts', { can_pay: false, payment: makePayment('failed', { attempts: 3 }) }, {}],
    [
      'awaiting_phone',
      { can_pay: false, can_cancel: false, payment: makePayment('initiated') },
      {},
    ],
    ['payment_cancelled', { payment: makePayment('cancelled') }, {}],
    [
      'payment_failed',
      { payment: makePayment('failed', { result_desc: 'Insufficient balance' }) },
      {},
    ],
    ['payment_timeout', { payment: makePayment('timeout') }, {}],
    [
      'paid',
      {
        status: 'paid',
        can_pay: false,
        can_cancel: false,
        payment: makePayment('completed', { mpesa_receipt_number: 'SBX4F7H2KQ' }),
      },
      {},
    ],
    ['expired', { status: 'expired', is_expired: true, can_pay: false, can_cancel: false }, {}],
    ['cancelled', { status: 'cancelled', can_pay: false, can_cancel: false }, {}],
    ['under_review', { status: 'needs_reconciliation', can_pay: false, can_cancel: false }, {}],
    ['closed_other', { status: 'payment_failed', can_pay: false, can_cancel: false }, {}],
  ])('the %s panel', async (kind, overrides, clock) => {
    serveOrder(() => makeOrder(/** @type {any} */ (overrides), clock));
    const { container } = renderBuyer(path);
    await waitFor(
      () => expect(screen.getByTestId('payment-panel')).toHaveAttribute('data-kind', kind),
      { timeout: 5000 },
    );
    await check(container);
  });

  it('the cancel dialog', async () => {
    const user = userEvent.setup();
    serveOrder(() => makeOrder());
    const { container } = renderBuyer(path);
    const panel = await screen.findByTestId('payment-panel', undefined, { timeout: 5000 });
    await user.click(within(panel).getByRole('button', { name: 'Cancel order' }));
    await screen.findByRole('dialog', { name: 'Cancel this order?' });
    expectNoBrokenValues(document.body);
    await expectNoAxeViolations(document.body);
    expect(container).toBeTruthy();
  });

  it('the "no result yet" state after the polling window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      serveOrder(() =>
        makeOrder(
          { can_pay: false, can_cancel: false, payment: makePayment('initiated') },
          { secondsLeft: 280 },
        ),
      );
      const { container } = renderBuyer(path);
      await screen.findByTestId('payment-panel', undefined, { timeout: 5000 });
      await vi.advanceTimersByTimeAsync(151_000);
      await screen.findByRole('button', { name: 'Check again' });
      await check(container);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('MyOrdersScreen accessibility', () => {
  it('loading', async () => {
    hang('/api/v1/orders/mine');
    const { container } = renderBuyer('/buyer/orders');
    await heading('My orders');
    await check(container);
  });

  it('success with the badge, Not paid, empty and error', async () => {
    const success = renderBuyer('/buyer/orders');
    await screen.findByText('Showing 6 of 6', undefined, { timeout: 5000 });
    await screen.findAllByTestId('nav-count-badge');
    await check(success.container);
    success.unmount();
    queryClient.clear();

    const notPaid = renderBuyer('/buyer/orders?status=not_paid');
    await screen.findByTestId('not-paid-note');
    await check(notPaid.container);
    notPaid.unmount();
    queryClient.clear();

    serveMyOrders([]);
    const empty = renderBuyer('/buyer/orders');
    await screen.findByText('You have no orders yet.');
    await check(empty.container);
    empty.unmount();
    queryClient.clear();

    fail('/api/v1/orders/mine');
    const failed = renderBuyer('/buyer/orders');
    await screen.findByText('Your orders could not be loaded');
    await check(failed.container);
  });
});
