import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, validationErrorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { expectNoPriceRequests, LISTING_ID, ORDER_ID, recordAll, renderBuyer } from '@/test/buyer';
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

const listing = fixtures.listingDetail; // beans in Kisumu, 40 kg at KES 112.56

/** @param {Record<string, any>} [overrides] */
function serveListing(overrides = {}) {
  const calls = { count: 0 };
  server.use(
    http.get(apiUrl('/api/v1/listings/:listingId'), () => {
      calls.count += 1;
      return HttpResponse.json({ ...listing, ...overrides });
    }),
  );
  return calls;
}

/**
 * Answer POST /orders with each answer in turn (the last repeats) and record the bodies.
 * @param {Array<() => Response | Promise<Response>>} answers
 */
function serveCreate(answers) {
  /** @type {string[]} */
  const bodies = [];
  server.use(
    http.post(apiUrl('/api/v1/orders'), async ({ request }) => {
      bodies.push(await request.text());
      return answers[Math.min(bodies.length, answers.length) - 1]();
    }),
  );
  return bodies;
}

async function openDetail(id = LISTING_ID) {
  const utils = renderBuyer(`/buyer/listings/${id}`);
  await screen.findByRole('heading', { name: 'Produce details', level: 1 }, { timeout: 5000 });
  await waitFor(() => expect(screen.queryByText('Loading the listing…')).not.toBeInTheDocument());
  return utils;
}

const quantity = () => screen.getByLabelText('Quantity (kg)');
const checkout = () => screen.getByRole('button', { name: /Continue to checkout/ });

/** @param {ReturnType<typeof userEvent.setup>} user @param {string} text */
async function typeQuantity(user, text) {
  await user.clear(quantity());
  if (text) await user.type(quantity(), text);
}

describe('ListingDetailScreen', () => {
  it('shows the listing: crop, market, seller, price per kg, bag price and quantity', async () => {
    await openDetail();
    expect(screen.getByRole('heading', { name: 'Beans in Kisumu', level: 2 })).toBeVisible();
    expect(screen.getByText('Sold by Peter Otieno')).toBeVisible();
    expect(screen.getByText('KES 112.56 per kg')).toBeVisible();
    expect(screen.getByText('About KES 10,130 per 90 kg bag')).toBeVisible();
    expect(screen.getByText('40 kg available')).toBeVisible();
    expect(screen.getByTestId('produce-photo-placeholder')).toBeInTheDocument();
    expect(screen.getByTestId('sandbox-note')).toHaveTextContent(
      'Enter your M-Pesa PIN only on the prompt on your phone. AgriSence never asks for your PIN.',
    );
  });

  it('estimates the total with the label "Estimate" and the 5 minute hold', async () => {
    const user = userEvent.setup();
    await openDetail();
    await typeQuantity(user, '2.5');
    // 2.5 kg at KES 112.56 is 281.40, rounded up to KES 282.
    expect(screen.getByTestId('estimate')).toHaveTextContent('KES 282');
    expect(
      screen.getByText('Estimate. The final amount is confirmed when you check out.'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'After checkout the produce is held for you for about 5 minutes while you pay.',
      ),
    ).toBeVisible();
  });

  it('keeps the stepper between 1 kg and the available quantity', async () => {
    const user = userEvent.setup();
    serveListing({ quantity_available: 2.5 });
    await openDetail();
    const minus = screen.getByRole('button', { name: 'Decrease quantity by 1 kg' });
    const plus = screen.getByRole('button', { name: 'Increase quantity by 1 kg' });
    expect(quantity()).toHaveValue('1');
    expect(minus).toBeDisabled();
    await user.click(plus);
    expect(quantity()).toHaveValue('2');
    await user.click(plus);
    expect(quantity()).toHaveValue('2.5');
    expect(plus).toBeDisabled();
    await user.click(minus);
    expect(quantity()).toHaveValue('1.5');
    await user.click(minus);
    expect(quantity()).toHaveValue('1');
    expect(minus).toBeDisabled();
    expect(quantity()).toHaveAttribute('inputmode', 'decimal');
    expect(quantity()).toHaveAttribute('aria-describedby', expect.stringContaining('hint'));
  });

  it('operates the stepper with the keyboard', async () => {
    const user = userEvent.setup();
    await openDetail();
    screen.getByRole('button', { name: 'Increase quantity by 1 kg' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(quantity()).toHaveValue('3');
  });

  it('says "Only n kg available." above the available amount and disables checkout', async () => {
    const user = userEvent.setup();
    await openDetail();
    await typeQuantity(user, '41');
    expect(screen.getByText('Only 40 kg available.')).toBeVisible();
    expect(quantity()).toHaveAttribute('aria-invalid', 'true');
    expect(checkout()).toBeDisabled();
  });

  it.each([
    ['0.5', 'Order at least 1 kg.'],
    ['1,5', 'Use a dot for decimals, for example 82.50'],
    ['abc', 'Enter a number using digits only, for example 82.50.'],
    ['1.234', 'Use at most 2 decimal places.'],
  ])('rejects the quantity %s with a message', async (text, message) => {
    const user = userEvent.setup();
    await openDetail();
    await typeQuantity(user, text);
    expect(screen.getByText(message)).toBeVisible();
    expect(checkout()).toBeDisabled();
  });

  it('shows "The minimum order is KES 10." below the minimum and disables checkout', async () => {
    const cheap = fixtures.publicListingsPage.items[4]; // KES 5 per kg, 1.5 kg
    await openDetail(cheap.id);
    expect(screen.getByTestId('estimate')).toHaveTextContent('KES 5');
    expect(screen.getByTestId('minimum-message')).toHaveTextContent('The minimum order is KES 10.');
    expect(checkout()).toBeDisabled();
  });

  it('shows a sold out banner, disables the stepper and checkout, and offers other produce', async () => {
    serveListing({ available: false, quantity_available: 0, status: 'sold_out' });
    await openDetail();
    const banner = screen.getByTestId('sold-out');
    expect(banner).toHaveTextContent('Sold out');
    expect(within(banner).getByRole('link', { name: 'Browse other produce' })).toHaveAttribute(
      'href',
      '/buyer/browse',
    );
    expect(quantity()).toBeDisabled();
    expect(checkout()).toBeDisabled();
  });

  it('shows "This listing is no longer available." for a 404', async () => {
    await openDetail('7a1b2c3d-0000-4000-8000-999999999999');
    expect(
      screen.getByRole('heading', { name: 'This listing is no longer available.' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Browse other produce' })).toHaveAttribute(
      'href',
      '/buyer/browse',
    );
  });

  it('shows the unavailable state for an id that is not a UUID, without a request', async () => {
    await openDetail('not-a-uuid');
    expect(
      screen.getByRole('heading', { name: 'This listing is no longer available.' }),
    ).toBeVisible();
    expect(recorder.of('GET', /\/api\/v1\/listings\//)).toHaveLength(0);
  });

  it('creates the order with exactly {listing_id, quantity} and opens it with a toast', async () => {
    const user = userEvent.setup();
    const bodies = serveCreate([() => HttpResponse.json(fixtures.orderPending, { status: 201 })]);
    const { router } = await openDetail();
    await typeQuantity(user, '2.5');
    await user.click(checkout());
    await waitFor(() => expect(router.state.location.pathname).toBe(`/buyer/orders/${ORDER_ID}`));
    expect(bodies).toHaveLength(1);
    const body = JSON.parse(bodies[0]);
    expect(Object.keys(body).sort()).toEqual(['listing_id', 'quantity']);
    // The spec accepts a number or a string; the typed decimal is sent as a string.
    expect(body).toEqual({ listing_id: LISTING_ID, quantity: '2.5' });
    expect(toast.success).toHaveBeenCalledWith('Order created. Complete payment within 5 minutes.');
    expect(await screen.findByRole('heading', { name: 'Your order', level: 1 })).toBeVisible();
    // Back goes to the listing (no loop: a second checkout finds the open order).
    expect(router.state.historyAction).toBe('PUSH');
  });

  it('sends one request for a double click', async () => {
    const user = userEvent.setup();
    const bodies = serveCreate([
      async () => {
        await delay(100);
        return HttpResponse.json(fixtures.orderPending, { status: 201 });
      },
    ]);
    const { router } = await openDetail();
    const button = checkout();
    await user.dblClick(button);
    await user.click(button);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/buyer/orders/${ORDER_ID}`));
    expect(bodies).toHaveLength(1);
  });

  it('shows "Creating your order…" and warns before leaving while the request runs', async () => {
    const user = userEvent.setup();
    /** @type {() => void} */
    let release = () => {};
    serveCreate([
      async () => {
        await new Promise((resolve) => (release = () => resolve(undefined)));
        return HttpResponse.json(fixtures.orderPending, { status: 201 });
      },
    ]);
    const { router } = await openDetail();
    await user.click(checkout());
    expect(await screen.findByRole('button', { name: /Creating your order/ })).toBeDisabled();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    // Let the request finish so nothing stays open after the test.
    release();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/buyer/orders/${ORDER_ID}`));
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('does not warn before leaving when no request runs', async () => {
    await openDetail();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('insufficient_stock refetches the listing, shows the new amount and keeps the form', async () => {
    const user = userEvent.setup();
    let stock = 40;
    server.use(
      http.get(apiUrl('/api/v1/listings/:listingId'), () =>
        HttpResponse.json({ ...listing, quantity_available: stock }),
      ),
    );
    serveCreate([
      () => {
        stock = 3;
        return errorResponse(409, 'insufficient_stock', { requestId: 'req-stock' });
      },
    ]);
    const { router } = await openDetail();
    await typeQuantity(user, '10');
    await user.click(checkout());
    const summary = await screen.findByRole('alert', { name: 'The order was not created' });
    expect(summary).toHaveTextContent(
      'There is not enough produce left. Choose a smaller quantity.',
    );
    await waitFor(() =>
      expect(summary).toHaveTextContent('The available quantity was updated: 3 kg available now.'),
    );
    expect(summary).toHaveFocus();
    expect(screen.getByText('3 kg available')).toBeVisible();
    expect(quantity()).toHaveValue('10');
    expect(screen.getByText('Only 3 kg available.')).toBeVisible();
    expect(router.state.location.pathname).toBe(`/buyer/listings/${LISTING_ID}`);
  });

  it.each(['listing_unavailable', 'listing_not_found'])(
    '%s shows the unavailable state',
    async (code) => {
      const user = userEvent.setup();
      serveCreate([() => errorResponse(code === 'listing_not_found' ? 404 : 409, code)]);
      await openDetail();
      await user.click(checkout());
      expect(
        await screen.findByRole('heading', { name: 'This listing is no longer available.' }),
      ).toBeVisible();
    },
  );

  it('pending_order_exists opens the existing order from extra.existing_order_id', async () => {
    const user = userEvent.setup();
    const existing = fixtures.buyerOrdersPage.items[0].id;
    serveCreate([
      () => errorResponse(409, 'pending_order_exists', { extra: { existing_order_id: existing } }),
    ]);
    const { router } = await openDetail();
    await user.click(checkout());
    await waitFor(() => expect(router.state.location.pathname).toBe(`/buyer/orders/${existing}`));
    expect(toast.info).toHaveBeenCalledWith(
      'You already have an order waiting for payment for this listing. Continue it or cancel it first.',
    );
    expect(await screen.findByRole('heading', { name: 'Your order', level: 1 })).toBeVisible();
  });

  it('too_many_pending_orders links to My orders filtered to waiting for payment', async () => {
    const user = userEvent.setup();
    serveCreate([() => errorResponse(409, 'too_many_pending_orders')]);
    await openDetail();
    await user.click(checkout());
    const summary = await screen.findByRole('alert', { name: 'The order was not created' });
    expect(summary).toHaveTextContent(
      'You have 3 orders waiting for payment. Pay for or cancel one first.',
    );
    expect(
      within(summary).getByRole('link', { name: 'See orders waiting for payment' }),
    ).toHaveAttribute('href', '/buyer/orders?status=pending_payment');
  });

  it('order_too_small shows the minimum message', async () => {
    const user = userEvent.setup();
    serveCreate([() => errorResponse(422, 'order_too_small')]);
    await openDetail();
    await user.click(checkout());
    expect(
      await screen.findByRole('alert', { name: 'The order was not created' }),
    ).toHaveTextContent('The total is below the minimum order of KES 10.');
  });

  it('a 422 validation error shows the generic field message', async () => {
    const user = userEvent.setup();
    serveCreate([() => validationErrorResponse([{ field: 'quantity', message: 'Too small.' }])]);
    await openDetail();
    await user.click(checkout());
    expect(
      await screen.findByRole('alert', { name: 'The order was not created' }),
    ).toHaveTextContent('Please check the highlighted fields.');
  });

  it('a 429 disables checkout for Retry-After seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const bodies = serveCreate([
        () => errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '30' } }),
      ]);
      await openDetail();
      await user.click(checkout());
      const summary = await screen.findByRole('alert', { name: 'The order was not created' });
      expect(summary).toHaveTextContent('Too many attempts. Try again in 30 seconds.');
      const button = screen.getByRole('button', { name: /Try again in 30 s/ });
      expect(button).toBeDisabled();
      await act(() => vi.advanceTimersByTimeAsync(31_000));
      expect(checkout()).toBeEnabled();
      expect(bodies).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['a network failure', () => HttpResponse.error()],
    [
      'a timeout',
      async () => {
        await delay('infinite');
        return HttpResponse.json({});
      },
    ],
  ])('after %s it offers no automatic retry, only a link to My orders', async (_name, answer) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const bodies = serveCreate([answer]);
      await openDetail();
      await user.click(checkout());
      await act(() => vi.advanceTimersByTimeAsync(21_000));
      const summary = await screen.findByRole('alert', { name: 'The order was not created' });
      expect(summary).toHaveTextContent(
        'We could not confirm whether your order was created. Check My orders before trying again.',
      );
      expect(within(summary).getByRole('link', { name: 'Go to My orders' })).toHaveAttribute(
        'href',
        '/buyer/orders',
      );
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(bodies).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a 500 shows the message and the reference', async () => {
    const user = userEvent.setup();
    serveCreate([() => errorResponse(500, 'internal_error', { requestId: 'req-create-500' })]);
    await openDetail();
    await user.click(checkout());
    const summary = await screen.findByRole('alert', { name: 'The order was not created' });
    expect(summary).toHaveTextContent('Something went wrong on our side. Please try again.');
    expect(summary).toHaveTextContent('req-create-500');
  });
});
