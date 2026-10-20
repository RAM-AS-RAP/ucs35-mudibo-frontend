import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import {
  expectNoPriceRequests,
  makeOrder,
  makePayment,
  ORDER_ID,
  recordAll,
  renderBuyer,
  serveOrder,
  servePay,
} from '@/test/buyer';
import { getSession } from '@/auth/session';
import { isValidIdempotencyKey } from '@/lib/idempotency';
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
  vi.useRealTimers();
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
  // @ts-expect-error  the test may have set an own property
  delete document.visibilityState;
});

const PATH = `/buyer/orders/${ORDER_ID}`;

async function openOrder(path = PATH) {
  const utils = renderBuyer(path);
  await screen.findByRole('heading', { name: 'Your order', level: 1 }, { timeout: 5000 });
  await waitFor(() => expect(screen.queryByText('Loading your order…')).not.toBeInTheDocument());
  return utils;
}

const panel = () => screen.getByTestId('payment-panel');
const payButton = () =>
  within(panel()).getByRole('button', { name: /Pay with M-Pesa|Try again|Check payment request/ });
const liveMessage = () => screen.getByTestId('payment-message');
const ok202 = () => HttpResponse.json(fixtures.paymentStarted, { status: 202 });

/** An open prompt on the phone, as GET /orders/{id} returns it while waiting. */
const waitingOrder = (overrides = {}, clock = {}) =>
  makeOrder(
    { can_pay: false, can_cancel: false, payment: makePayment('initiated'), ...overrides },
    clock,
  );

/** @param {number} ms */
const advance = (ms) => act(() => vi.advanceTimersByTimeAsync(ms));

/** Fake timers that still let Testing Library's waits run. */
function fakeTimers() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe('OrderScreen: summary', () => {
  it("shows the order with the server's total_amount exactly", async () => {
    serveOrder(() => makeOrder());
    await openOrder();
    const card = /** @type {HTMLElement} */ (
      document.querySelector(`[data-order-id="${ORDER_ID}"]`)
    );
    // 2.5 kg at KES 112.56 is 281.40; the server's total is 282.
    expect(within(card).getByTestId('order-total')).toHaveTextContent('KES 282.00');
    expect(card).not.toHaveTextContent('281.40');
    expect(card).toHaveTextContent('AGR-B7Q2M4');
    expect(card).toHaveTextContent('Beans in Kisumu');
    expect(card).toHaveTextContent('Sold by Peter Otieno');
    expect(card).toHaveTextContent('2.5 kg');
    expect(card).toHaveTextContent('KES 112.56');
    expect(within(card).getByText('Waiting for payment')).toBeInTheDocument();
    expect(screen.getByTestId('sandbox-note')).toHaveTextContent(fixtures.orderPending.note);
  });

  it('shows the order time in Nairobi time', async () => {
    serveOrder(() => makeOrder({ created_at: '2026-10-20T06:15:00Z' }));
    await openOrder();
    expect(screen.getByText('20 Oct 2026, 09:15')).toBeInTheDocument();
  });

  it('copies the reference with the keyboard', async () => {
    const user = userEvent.setup();
    serveOrder(() => makeOrder());
    await openOrder();
    screen.getByRole('button', { name: 'Copy reference AGR-B7Q2M4' }).focus();
    await user.keyboard('{Enter}');
    await expect(navigator.clipboard.readText()).resolves.toBe('AGR-B7Q2M4');
    expect(toast.success).toHaveBeenCalledWith('Reference copied');
  });

  it('shows "This order could not be found." for a 404', async () => {
    await openOrder('/buyer/orders/5c0d1e2f-0000-4000-8000-999999999999');
    expect(screen.getByRole('heading', { name: 'This order could not be found.' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'My orders' })).toHaveAttribute(
      'href',
      '/buyer/orders',
    );
  });

  it('shows not found for an id that is not a UUID, without a request', async () => {
    await openOrder('/buyer/orders/12');
    expect(screen.getByRole('heading', { name: 'This order could not be found.' })).toBeVisible();
    // The navigation badge reads GET /orders/mine; the order itself is never requested.
    expect(recorder.of('GET', /\/api\/v1\/orders\/(?!mine$)/)).toHaveLength(0);
  });

  it('shows an error with Try again and the reference for a 500', async () => {
    server.use(
      http.get(apiUrl('/api/v1/orders/:orderId'), () =>
        errorResponse(500, 'internal_error', { requestId: 'req-order-500' }),
      ),
    );
    await openOrder();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The order could not be loaded');
    expect(alert).toHaveTextContent('Reference: req-order-500');
  }, 15_000);

  it('never asks for a PIN and shows no phone number except the masked prompt target', async () => {
    const user = userEvent.setup();
    serveOrder((call) =>
      call === 1
        ? makeOrder({ listing: { ...fixtures.orderPending.listing, seller_phone: '0712345678' } })
        : waitingOrder(),
    );
    servePay([ok202]);
    const { container } = await openOrder();
    await user.click(payButton());
    await within(panel()).findByText('Prompt sent to 254*******149');
    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/(\+?254|0)7\d{8}/);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text.match(/\d[\d*]{8,}\d/g)).toEqual(['254*******149']);
    expect(text).toContain(
      'Enter your M-Pesa PIN only on the prompt on your phone. AgriSence never asks for your PIN.',
    );
  });
});

describe('OrderScreen: paying', () => {
  it('sends the Idempotency-Key header and no body, then shows the waiting panel', async () => {
    const user = userEvent.setup();
    const calls = servePay([ok202]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    expect(
      screen.getByText(
        'You will get a prompt on your registered phone number. Approve it with your M-Pesa PIN.',
      ),
    ).toBeVisible();
    await user.click(payButton());
    await within(panel()).findByText('Prompt sent to 254*******149');
    expect(calls).toHaveLength(1);
    expect(isValidIdempotencyKey(calls[0].key)).toBe(true);
    expect(calls[0].body).toBe('');
    expect(liveMessage()).toHaveTextContent('Check your phone and enter your M-Pesa PIN.');
    expect(liveMessage()).toHaveAttribute('aria-live', 'polite');
    expect(within(panel()).getByText('Waiting for you to confirm on your phone')).toBeVisible();
    expect(
      within(panel()).getByText(
        'If you did not get a prompt, wait for this one to expire before trying again. Only one prompt can be active on a phone.',
      ),
    ).toBeVisible();
  });

  it('drops the pay message once the order reaches a final state', async () => {
    const user = fakeTimers();
    servePay([ok202]);
    serveOrder((call) =>
      call === 1
        ? makeOrder()
        : makeOrder({
            status: 'paid',
            can_pay: false,
            can_cancel: false,
            payment: makePayment('completed', { mpesa_receipt_number: 'SBX9K2L4QW' }),
          }),
    );
    await openOrder();
    await user.click(payButton());
    await waitFor(() =>
      expect(liveMessage()).toHaveTextContent('Check your phone and enter your M-Pesa PIN.'),
    );
    await advance(3000);
    await waitFor(() => expect(panel()).toHaveAttribute('data-kind', 'paid'));
    expect(liveMessage()).toHaveTextContent('');
  });

  it('moves focus to the panel headline when the kind changes', async () => {
    const user = userEvent.setup();
    servePay([ok202]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await user.click(payButton());
    const heading = await within(panel()).findByRole('heading', {
      name: 'Check your phone and enter your M-Pesa PIN',
    });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('shows "Sending request", disables the button and warns before leaving while paying', async () => {
    const user = userEvent.setup();
    /** @type {() => void} */
    let release = () => {};
    servePay([
      async () => {
        await new Promise((resolve) => (release = () => resolve(undefined)));
        return ok202();
      },
    ]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await user.click(payButton());
    const sending = await within(panel()).findByRole('button', { name: /Sending request/ });
    expect(sending).toBeDisabled();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    release();
    await within(panel()).findByText('Prompt sent to 254*******149');
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('reuses the same key after a network failure ("Check payment request")', async () => {
    const user = userEvent.setup();
    const calls = servePay([() => HttpResponse.error(), () => HttpResponse.error(), ok202]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await user.click(payButton());
    expect(
      await within(panel()).findByRole('button', { name: /Check payment request/ }),
    ).toBeEnabled();
    expect(liveMessage()).toHaveTextContent(
      'We could not confirm whether the payment request was sent.',
    );
    await user.click(payButton());
    await waitFor(() => expect(calls).toHaveLength(2));
    await user.click(await within(panel()).findByRole('button', { name: /Check payment request/ }));
    await within(panel()).findByText('Prompt sent to 254*******149');
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => c.key)).size).toBe(1);
  });

  it('reuses the same key after a timeout', async () => {
    const user = fakeTimers();
    const calls = servePay([
      async () => {
        await delay('infinite');
        return ok202();
      },
      ok202,
    ]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await user.click(payButton());
    await advance(21_000);
    await user.click(await within(panel()).findByRole('button', { name: /Check payment request/ }));
    await within(panel()).findByText('Prompt sent to 254*******149');
    expect(calls).toHaveLength(2);
    expect(calls[1].key).toBe(calls[0].key);
  });

  it('uses a new key after a definitive error and for each new deliberate attempt', async () => {
    const user = userEvent.setup();
    const calls = servePay([() => errorResponse(502, 'payment_request_failed'), ok202]);
    serveOrder((call) =>
      call === 1
        ? makeOrder()
        : makeOrder({
            payment: makePayment('cancelled', {
              status_message: 'You cancelled the payment request',
            }),
          }),
    );
    await openOrder();
    await user.click(payButton());
    expect(
      await within(panel()).findByText('Could not start the M-Pesa prompt. Please try again.'),
    ).toBeVisible();
    expect(payButton()).toHaveTextContent('Pay with M-Pesa');
    await user.click(payButton());
    // The 202 is followed by a cancelled payment: "Try again" is a new deliberate attempt.
    // The next poll (3 seconds later) reports the cancelled payment.
    const retry = await within(panel()).findByRole(
      'button',
      { name: /Try again/ },
      { timeout: 6000 },
    );
    await user.click(retry);
    await waitFor(() => expect(calls).toHaveLength(3));
    const keys = calls.map((c) => c.key);
    expect(keys.every(isValidIdempotencyKey)).toBe(true);
    expect(new Set(keys).size).toBe(3);
  });

  it('never stores the key in sessionStorage, localStorage, the URL or a query key', async () => {
    const user = userEvent.setup();
    const calls = servePay([() => HttpResponse.error()]);
    serveOrder(() => makeOrder());
    const { router } = await openOrder();
    await user.click(payButton());
    await within(panel()).findByRole('button', { name: /Check payment request/ });
    const key = /** @type {string} */ (calls[0].key);
    expect(key).toBeTruthy();
    const stored = [window.sessionStorage, window.localStorage].flatMap((store) =>
      Object.keys(store).map((name) => `${name}=${store.getItem(name)}`),
    );
    expect(stored.join('\n')).not.toContain(key);
    expect(router.state.location.pathname + router.state.location.search).not.toContain(key);
    expect(JSON.stringify(router.state.location.state ?? null)).not.toContain(key);
    const queryKeys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(JSON.stringify(queryKeys)).not.toContain(key);
    const mutations = queryClient
      .getMutationCache()
      .getAll()
      .map((m) => m.state.variables);
    expect(JSON.stringify(mutations ?? null)).not.toContain(key);
  });

  it.each([
    [
      'too_close',
      { can_pay: false },
      { secondsLeft: 60 },
      'There is not enough time left to start a payment. Cancel this order and start again.',
    ],
    [
      'max_attempts',
      { can_pay: false, payment: makePayment('failed', { attempts: 3 }) },
      { secondsLeft: 240 },
      'You have tried to pay for this order 3 times. Cancel it and start a new order.',
    ],
    [
      'pay_ready',
      { can_pay: false },
      { secondsLeft: 240 },
      'Payment cannot be started for this order right now.',
    ],
  ])(
    'disables Pay when can_pay is false (%s) and explains why',
    async (kind, overrides, clock, text) => {
      serveOrder(() => makeOrder(overrides, clock));
      await openOrder();
      expect(panel()).toHaveAttribute('data-kind', kind);
      expect(payButton()).toBeDisabled();
      expect(within(panel()).getByText(text)).toBeVisible();
      // Cancel stays available when the server allows it.
      expect(within(panel()).getByRole('button', { name: 'Cancel order' })).toBeEnabled();
    },
  );

  it('shows no Pay button while a prompt is open', async () => {
    serveOrder(() => waitingOrder());
    await openOrder();
    expect(within(panel()).queryByRole('button', { name: /Pay with M-Pesa/ })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'Cancel order' })).toBeNull();
  });
});

describe('OrderScreen: pay errors', () => {
  it.each([
    [
      'order_not_payable',
      409,
      {},
      'This order can no longer be paid. Its current state is shown below.',
      true,
    ],
    ['order_expiring (expired)', 409, { reason: 'expired' }, 'This order has expired.', true],
    [
      'order_expiring (too_close)',
      409,
      { reason: 'too_close' },
      'There is not enough time left to start a payment. Cancel this order and start again.',
      false,
    ],
    ['payment_in_progress', 409, {}, 'A payment is already in progress. Check your phone.', true],
    [
      'max_attempts_reached',
      409,
      {},
      'You have tried to pay for this order 3 times. Cancel it and start a new order.',
      false,
    ],
    [
      'payments_unavailable',
      503,
      {},
      'Payments are temporarily unavailable. Please try again soon.',
      false,
    ],
    [
      'payment_request_failed',
      502,
      {},
      'Could not start the M-Pesa prompt. Please try again.',
      false,
    ],
    ['invalid_idempotency_key', 422, {}, 'Something went wrong. Please try again.', false],
    ['internal_error', 500, {}, 'Something went wrong on our side. Please try again.', false],
    ['forbidden', 403, {}, "You don't have access to this page.", false],
  ])('%s shows its message in the live region', async (label, status, extra, text, refetches) => {
    const user = userEvent.setup();
    const code = label.split(' ')[0];
    servePay([() => errorResponse(status, code, { extra })]);
    const calls = serveOrder(() => makeOrder());
    await openOrder();
    const before = calls.count;
    await user.click(payButton());
    await waitFor(() => expect(liveMessage()).toHaveTextContent(text));
    if (refetches) await waitFor(() => expect(calls.count).toBe(before + 1));
    else {
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(calls.count).toBe(before);
    }
  });

  it('payment_in_progress shows the waiting panel after the refetch', async () => {
    const user = userEvent.setup();
    servePay([() => errorResponse(409, 'payment_in_progress')]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await user.click(payButton());
    await waitFor(() => expect(panel()).toHaveAttribute('data-kind', 'awaiting_phone'));
  });

  it('too_many_payment_attempts (429) waits for Retry-After before Pay works again', async () => {
    const user = fakeTimers();
    const calls = servePay([
      () => errorResponse(429, 'too_many_payment_attempts', { headers: { 'Retry-After': '20' } }),
      ok202,
    ]);
    serveOrder(() => makeOrder({}, { secondsLeft: 280 }));
    await openOrder();
    await user.click(payButton());
    await waitFor(() =>
      expect(liveMessage()).toHaveTextContent(
        'Too many payment attempts for this phone number. Please try again later.',
      ),
    );
    const waiting = within(panel()).getByRole('button', { name: /Try again in 20 s/ });
    expect(waiting).toBeDisabled();
    await advance(21_000);
    expect(payButton()).toBeEnabled();
    expect(calls).toHaveLength(1);
  });
});

describe('OrderScreen: waiting for the phone and polling', () => {
  it('polls every 3 seconds while the prompt is open and stops at a final state', async () => {
    fakeTimers();
    const calls = serveOrder((call) =>
      call < 4
        ? waitingOrder()
        : makeOrder({
            status: 'paid',
            can_pay: false,
            can_cancel: false,
            payment: makePayment('completed', { mpesa_receipt_number: 'SBX9K2L4QW' }),
          }),
    );
    await openOrder();
    expect(calls.count).toBe(1);
    await advance(3000);
    expect(calls.count).toBe(2);
    await advance(3000);
    expect(calls.count).toBe(3);
    await advance(3000);
    expect(calls.count).toBe(4);
    expect(await within(panel()).findByText('Receipt SBX9K2L4QW')).toBeVisible();
    await advance(30_000);
    expect(calls.count).toBe(4);
  });

  it('stops after 150 seconds, says so, and "Check again" starts a new window', async () => {
    const user = fakeTimers();
    const calls = serveOrder(() => waitingOrder({}, { secondsLeft: 280 }));
    await openOrder();
    await advance(150_000);
    const count = calls.count;
    // One request at the start and one every 3 seconds inside the window.
    expect(count).toBeGreaterThanOrEqual(50);
    expect(count).toBeLessThanOrEqual(51);
    expect(
      await within(panel()).findByText(
        'We have not received a result yet. Your order stays open until the timer ends. Check again, or leave and find this order in My orders.',
      ),
    ).toBeVisible();
    await advance(30_000);
    expect(calls.count).toBe(count);
    await user.click(within(panel()).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(calls.count).toBe(count + 1));
    expect(
      within(panel()).queryByText(/We have not received a result yet/),
    ).not.toBeInTheDocument();
    await advance(3000);
    expect(calls.count).toBe(count + 2);
  });

  it('pauses while the tab is hidden and refetches at once when it is visible again', async () => {
    fakeTimers();
    const calls = serveOrder(() => waitingOrder());
    await openOrder();
    await advance(3000);
    const count = calls.count;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await advance(12_000);
    expect(calls.count).toBe(count);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(calls.count).toBe(count + 1));
  });

  it('stops polling and every timer on unmount', async () => {
    fakeTimers();
    const calls = serveOrder(() => waitingOrder());
    const { unmount } = await openOrder();
    await advance(3000);
    unmount();
    queryClient.clear();
    const count = calls.count;
    await advance(30_000);
    expect(calls.count).toBe(count);
    // Only the session expiry timer is left.
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
  });

  it('stops polling after a 401 (the session ends and the login screen opens)', async () => {
    fakeTimers();
    const calls = serveOrder((call) =>
      call === 1 ? waitingOrder() : errorResponse(401, 'invalid_credentials'),
    );
    const { router } = await openOrder();
    await advance(3000);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(getSession()).toBeNull();
    const count = calls.count;
    await advance(30_000);
    expect(calls.count).toBe(count);
  });
});

describe('OrderScreen: countdown', () => {
  /** @param {number} offsetMs  server clock minus device clock */
  async function openWithSkew(offsetMs) {
    fakeTimers();
    vi.setSystemTime(new Date('2026-10-20T09:00:00Z'));
    serveOrder(() => makeOrder({}, { serverNowMs: Date.now() + offsetMs, secondsLeft: 300 }));
    await openOrder();
    return screen.getByTestId('expiry-countdown');
  }

  it.each([
    ['in sync with the server', 0],
    ['5 minutes behind the server', 300_000],
    ['5 minutes ahead of the server', -300_000],
  ])('follows the server clock when the device is %s', async (_name, offsetMs) => {
    const countdown = await openWithSkew(offsetMs);
    expect(countdown).toHaveTextContent(/Complete payment within 0(5:00|4:59)/);
    await advance(60_000);
    expect(countdown).toHaveTextContent(/Complete payment within 0(4:00|3:59)/);
    expect(panel()).toHaveAttribute('data-kind', 'pay_ready');
  });

  it('announces only at 60 seconds, 30 seconds and the end, in a polite region', async () => {
    fakeTimers();
    serveOrder((call) =>
      call === 1
        ? makeOrder({}, { secondsLeft: 65 })
        : makeOrder({ status: 'expired', is_expired: true, can_pay: false, can_cancel: false }),
    );
    await openOrder();
    const region = screen.getByTestId('countdown-announcement');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('expiry-countdown').closest('[aria-live]')).toBeNull();
    /** @type {string[]} */
    const heard = [];
    const observer = new MutationObserver(() => heard.push(region.textContent ?? ''));
    observer.observe(region, { childList: true, characterData: true, subtree: true });
    for (let i = 0; i < 70; i += 1) await advance(1000);
    observer.disconnect();
    expect(heard.filter(Boolean)).toEqual([
      'One minute left to complete the payment.',
      '30 seconds left to complete the payment.',
      'The time to pay has ended.',
    ]);
  });

  it('refetches the order once at zero, then shows the expired state', async () => {
    fakeTimers();
    const calls = serveOrder((call) =>
      call === 1
        ? makeOrder({}, { secondsLeft: 3 })
        : makeOrder({
            status: 'pending_payment',
            is_expired: true,
            can_pay: false,
            can_cancel: false,
          }),
    );
    await openOrder();
    expect(calls.count).toBe(1);
    await advance(4000);
    await waitFor(() => expect(calls.count).toBe(2));
    await advance(20_000);
    expect(calls.count).toBe(2);
    expect(panel()).toHaveAttribute('data-kind', 'expired');
    expect(screen.queryByTestId('expiry-countdown')).not.toBeInTheDocument();
  });
});

describe('OrderScreen: result states', () => {
  const listingId = fixtures.orderPending.listing.id;

  it.each([
    [
      'paid with a receipt',
      {
        status: 'paid',
        can_pay: false,
        can_cancel: false,
        payment: makePayment('completed', { mpesa_receipt_number: 'SBX4F7H2KQ' }),
      },
      'paid',
      [
        'Payment received (test)',
        'Receipt SBX4F7H2KQ',
        'KES 282.00',
        'AGR-B7Q2M4',
        'no real money moved',
        'Delivery is not part of this prototype.',
      ],
      [
        ['link', 'Browse produce', '/buyer/browse'],
        ['link', 'My orders', '/buyer/orders'],
      ],
    ],
    [
      'paid without a receipt',
      {
        status: 'paid',
        can_pay: false,
        can_cancel: false,
        payment: makePayment('completed', { mpesa_receipt_number: null }),
      },
      'paid',
      ['Payment received (test)', 'KES 282.00'],
      [],
    ],
    [
      'payment_cancelled',
      {
        payment: makePayment('cancelled', { status_message: 'You cancelled the payment request' }),
      },
      'payment_cancelled',
      ['Payment request cancelled', 'You cancelled the payment request.'],
      [['button', 'Try again', null]],
    ],
    [
      'payment_failed with a reason',
      {
        payment: makePayment('failed', {
          status_message: 'The payment failed',
          result_desc: 'Insufficient balance',
        }),
      },
      'payment_failed',
      ['The payment did not go through', 'The payment failed', 'Reason: Insufficient balance'],
      [['button', 'Try again', null]],
    ],
    [
      'payment_timeout',
      { payment: makePayment('timeout', { status_message: 'The request timed out' }) },
      'payment_timeout',
      ['The payment request timed out', 'The request timed out'],
      [['button', 'Try again', null]],
    ],
    [
      'expired',
      { status: 'expired', is_expired: true, can_pay: false, can_cancel: false },
      'expired',
      ['This order expired and the produce was released. You can start a new order.'],
      [['link', 'Order this produce again', `/buyer/listings/${listingId}`]],
    ],
    [
      'cancelled',
      { status: 'cancelled', can_pay: false, can_cancel: false },
      'cancelled',
      ['You cancelled this order.'],
      [['link', 'Browse produce', '/buyer/browse']],
    ],
    [
      'under_review',
      {
        status: 'needs_reconciliation',
        can_pay: false,
        can_cancel: false,
        payment: makePayment('completed'),
      },
      'under_review',
      [
        'Your payment is under review. If money was taken, an administrator will check it. Keep your reference AGR-B7Q2M4.',
      ],
      [],
    ],
  ])('%s renders its text, icon and buttons', async (_name, overrides, kind, texts, controls) => {
    serveOrder(() => makeOrder(/** @type {any} */ (overrides)));
    await openOrder();
    expect(panel()).toHaveAttribute('data-kind', kind);
    expect(within(panel()).getByTestId('panel-icon')).toHaveAttribute('data-icon', kind);
    for (const text of texts) expect(panel()).toHaveTextContent(text);
    for (const [role, name, href] of controls) {
      const control = within(panel()).getByRole(/** @type {any} */ (role), {
        name: new RegExp(name),
      });
      if (href) expect(control).toHaveAttribute('href', href);
      else expect(control).toBeEnabled();
    }
    expect(panel()).not.toHaveTextContent(/refund/i);
    if (kind === 'paid' && !texts.includes('Receipt SBX4F7H2KQ')) {
      expect(panel()).not.toHaveTextContent('Receipt');
    }
    if (kind !== 'payment_failed')
      expect(within(panel()).queryByTestId('payment-reason')).toBeNull();
    // Final states offer neither Pay nor Cancel.
    if (['paid', 'expired', 'cancelled', 'under_review'].includes(kind)) {
      expect(
        within(panel()).queryByRole('button', { name: /Pay with M-Pesa|Cancel order/ }),
      ).toBeNull();
      expect(screen.queryByTestId('expiry-countdown')).not.toBeInTheDocument();
    }
  });
});

describe('OrderScreen: cancel', () => {
  it('asks first, moves focus into the dialog and back to the trigger on Escape', async () => {
    const user = userEvent.setup();
    serveOrder(() => makeOrder());
    await openOrder();
    const trigger = within(panel()).getByRole('button', { name: 'Cancel order' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Cancel this order?' });
    expect(dialog).toHaveTextContent('The produce is released for other buyers.');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('cancels on confirm with a toast and the cancelled state', async () => {
    const user = userEvent.setup();
    serveOrder(() => makeOrder());
    await openOrder();
    await user.click(within(panel()).getByRole('button', { name: 'Cancel order' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));
    await waitFor(() => expect(panel()).toHaveAttribute('data-kind', 'cancelled'));
    expect(toast.success).toHaveBeenCalledWith('Order cancelled');
    expect(recorder.of('POST', `/api/v1/orders/${ORDER_ID}/cancel`)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Order cancelled' })).toHaveFocus();
  });

  it.each([
    ['payment_in_progress', 'A payment is in progress. Please wait for it to finish.'],
    [
      'order_not_cancellable',
      'This order can no longer be cancelled. Its current state is shown below.',
    ],
  ])('409 %s closes the dialog, refetches and explains', async (code, text) => {
    const user = userEvent.setup();
    server.use(http.post(apiUrl('/api/v1/orders/:orderId/cancel'), () => errorResponse(409, code)));
    const calls = serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await user.click(within(panel()).getByRole('button', { name: 'Cancel order' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(calls.count).toBe(2));
    expect(liveMessage()).toHaveTextContent(text);
  });
});
