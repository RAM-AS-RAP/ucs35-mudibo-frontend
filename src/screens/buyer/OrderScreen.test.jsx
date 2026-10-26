import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout, renderApp } from '@/test/render';
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
import { getSession, setFromLogin } from '@/auth/session';
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

/**
 * @param {string} [path]
 * @param {{ sessionSeconds?: number }} [options]  a longer session for tests that move the clock by hours
 */
async function openOrder(path = PATH, { sessionSeconds } = {}) {
  let utils;
  if (sessionSeconds) {
    setFromLogin({
      access_token: 'test-token-not-a-secret',
      token_type: 'bearer',
      expires_in: sessionSeconds,
      role: 'buyer',
      is_super_admin: false,
      must_change_password: false,
    });
    utils = renderApp(path);
  } else utils = renderBuyer(path);
  await screen.findByRole('heading', { name: 'Your order', level: 1 }, { timeout: 5000 });
  await waitFor(() => expect(screen.queryByText('Loading your order…')).not.toBeInTheDocument());
  return utils;
}

const panel = () => screen.getByTestId('payment-panel');
const payButton = () =>
  within(panel()).getByRole('button', { name: /Pay with M-Pesa|Try again|Check payment request/ });
const liveMessage = () => screen.getByTestId('payment-message');
const ok202 = () => HttpResponse.json(fixtures.paymentStarted, { status: 202 });
const phoneField = () =>
  /** @type {HTMLInputElement} */ (within(panel()).getByLabelText('M-Pesa phone number'));
const confirmDialog = () => screen.findByRole('dialog', { name: 'Send the payment prompt?' });

/**
 * Type the number (when the field does not hold it yet), press Pay and confirm with
 * "Send prompt".
 * @param {ReturnType<typeof userEvent.setup>} user
 * @param {string} [number]
 */
async function payWith(user, number = '0712 345 678') {
  const field = phoneField();
  if (field.value !== number) {
    await user.clear(field);
    await user.type(field, number);
  }
  await user.click(payButton());
  const dialog = await confirmDialog();
  await user.click(within(dialog).getByRole('button', { name: 'Send prompt' }));
}

/** "Check payment request" after an unknown result: sends again at once, without the dialog. */
async function checkRequest(/** @type {ReturnType<typeof userEvent.setup>} */ user) {
  await user.click(await within(panel()).findByRole('button', { name: /Check payment request/ }));
}

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

  it('never asks for a PIN and shows no phone number except the typed one and masked values', async () => {
    const user = userEvent.setup();
    // Extra fields that a future server might add: none of them may reach the screen.
    const leaky = {
      listing: { ...fixtures.orderPending.listing, seller_phone: '0799111222' },
      buyer_phone: '254788999000',
    };
    serveOrder((call) =>
      call === 1
        ? makeOrder(leaky)
        : waitingOrder({
            ...leaky,
            payment: makePayment('initiated', {
              phone_number: '254712345678',
              msisdn: '0712345678',
            }),
          }),
    );
    servePay([ok202]);
    const { container } = await openOrder();
    const inputs = container.querySelectorAll('input, textarea, select');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveAttribute('type', 'tel');
    await payWith(user);
    await within(panel()).findByText('Prompt sent to 254*******149');
    // The field is gone while the prompt is open; only the masked values remain.
    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/(\+?254|0)[17]\d{8}/);
    expect(text).not.toMatch(/0712 345 678|0799|0788/);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text.match(/\d[\d*]{8,}\d/g)).toEqual(['254*******149']);
    expect(text).toContain(
      'Enter your M-Pesa PIN only on the prompt on your phone. AgriSence never asks for your PIN.',
    );
    expect(text).not.toMatch(/\bPIN\b[^.]*:/);
  });
});

describe('OrderScreen: the M-Pesa number', () => {
  it('shows an empty field with its name, hint and input attributes above Pay', async () => {
    serveOrder(() => makeOrder());
    await openOrder();
    const field = phoneField();
    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('type', 'tel');
    expect(field).toHaveAttribute('inputmode', 'tel');
    expect(field).toHaveAttribute('autocomplete', 'tel');
    expect(field).toHaveAttribute('autocapitalize', 'off');
    expect(field).toHaveAttribute('spellcheck', 'false');
    expect(field).toHaveAccessibleDescription(
      'The Safaricom number that will get the payment prompt. For example 0712 345 678.',
    );
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(field.className).toMatch(/min-h-11/);
    expect(field.className).toMatch(/text-base/);
    // The field comes before the button in the reading order.
    expect(field.compareDocumentPosition(payButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      screen.getByText('You will get a prompt on this number. Approve it with your M-Pesa PIN.'),
    ).toBeVisible();
    expect(payButton()).toHaveAccessibleDescription(
      'You will get a prompt on this number. Approve it with your M-Pesa PIN.',
    );
  });

  it.each([
    ['empty', '', 'Enter the M-Pesa number to send the payment prompt to.'],
    ['short', '0712 345', 'Enter a valid Safaricom number, for example 0712 345 678.'],
    ['letters', '07ab345678', 'Enter a valid Safaricom number, for example 0712 345 678.'],
    ['255', '255712345678', 'Enter a valid Safaricom number, for example 0712 345 678.'],
  ])(
    'an %s number shows the error, moves focus to the field and sends nothing',
    async (_n, typed, text) => {
      const user = userEvent.setup();
      const calls = servePay([ok202]);
      serveOrder(() => makeOrder());
      await openOrder();
      if (typed) await user.type(phoneField(), typed);
      await user.click(payButton());
      await waitFor(() => expect(phoneField()).toHaveFocus());
      expect(phoneField()).toHaveAttribute('aria-invalid', 'true');
      expect(phoneField()).toHaveAccessibleDescription(expect.stringContaining(text));
      expect(within(panel()).getByText(text)).toBeVisible();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(calls).toHaveLength(0);
      // Typing again clears the error.
      await user.type(phoneField(), '1');
      expect(phoneField()).not.toHaveAttribute('aria-invalid');
    },
  );

  it('keeps spaces and dashes inside the number and trims only the ends', async () => {
    const user = userEvent.setup();
    serveOrder(() => makeOrder());
    await openOrder();
    await user.type(phoneField(), '  0712-345 678  ');
    expect(phoneField()).toHaveValue('  0712-345 678  ');
    await user.tab();
    expect(phoneField()).toHaveValue('0712-345 678');
  });

  it("confirms with the typed number in local format and the server's total", async () => {
    const user = userEvent.setup();
    const calls = servePay([ok202]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await user.type(phoneField(), '+254-712 345678');
    await user.click(payButton());
    const dialog = await confirmDialog();
    expect(dialog).toHaveTextContent(
      'We will send an M-Pesa prompt for KES 282.00 to 0712 345 678.',
    );
    expect(dialog).toHaveTextContent(
      'Make sure this is your own number and that your phone is on.',
    );
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(calls).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Send prompt' }));
    await within(panel()).findByText('Prompt sent to 254*******149');
    expect(calls).toHaveLength(1);
  });

  it('"Change number" closes the dialog, sends nothing and returns focus to the field', async () => {
    const user = userEvent.setup();
    const calls = servePay([ok202]);
    serveOrder(() => makeOrder());
    await openOrder();
    await user.type(phoneField(), '0712345678');
    await user.click(payButton());
    const dialog = await confirmDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Change number' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(phoneField()).toHaveFocus();
    expect(phoneField()).toHaveValue('0712345678');
    // Escape also closes it while nothing is in flight.
    await user.click(payButton());
    await confirmDialog();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(phoneField()).toHaveFocus();
    expect(calls).toHaveLength(0);
  });

  it('keeps focus inside the dialog (focus trap)', async () => {
    const user = userEvent.setup();
    serveOrder(() => makeOrder());
    await openOrder();
    await user.type(phoneField(), '0712345678');
    await user.click(payButton());
    const dialog = await confirmDialog();
    for (let i = 0; i < 5; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it.each([
    ['0712 345 678', '254712345678'],
    ['0712-345-678', '254712345678'],
    ['+254 712 345 678', '254712345678'],
    ['254712345678', '254712345678'],
    ['0110 123 456', '254110123456'],
  ])('sends %s as {"phone_number": "%s"} with the key header', async (typed, sent) => {
    const user = userEvent.setup();
    const calls = servePay([ok202]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await payWith(user, typed);
    await within(panel()).findByText('Prompt sent to 254*******149');
    expect(calls).toHaveLength(1);
    expect(isValidIdempotencyKey(calls[0].key)).toBe(true);
    expect(calls[0].contentType).toMatch(/^application\/json/);
    expect(JSON.parse(calls[0].body)).toEqual({ phone_number: sent });
  });

  it('a double click on "Send prompt" sends one request; Escape cannot close it meanwhile', async () => {
    const user = userEvent.setup();
    /** @type {() => void} */
    let release = () => {};
    const calls = servePay([
      async () => {
        await new Promise((resolve) => (release = () => resolve(undefined)));
        return ok202();
      },
    ]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await user.type(phoneField(), '0712345678');
    await user.click(payButton());
    const dialog = await confirmDialog();
    const status = within(dialog).getByTestId('send-status');
    /** @type {string[]} */
    const heard = [];
    const observer = new MutationObserver(() => heard.push(status.textContent ?? ''));
    observer.observe(status, { childList: true, characterData: true, subtree: true });
    const send = within(dialog).getByRole('button', { name: 'Send prompt' });
    await user.dblClick(send);
    const sending = await within(dialog).findByRole('button', { name: /Sending request/ });
    expect(sending).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Change number' })).toBeDisabled();
    expect(status).toHaveAttribute('aria-live', 'polite');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    observer.disconnect();
    expect(calls).toHaveLength(1);
    expect(heard.filter(Boolean)).toEqual(['Sending request']);
  });

  it('disables the field while the request is in flight', async () => {
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
    await payWith(user);
    await screen.findByRole('button', { name: /Sending request/ });
    // The panel is hidden from the accessibility tree behind the dialog; query the DOM.
    expect(/** @type {HTMLInputElement} */ (document.getElementById('mpesa-phone')).disabled).toBe(
      true,
    );
    release();
    await within(panel()).findByText('Prompt sent to 254*******149');
  });
});

describe('OrderScreen: paying', () => {
  it('sends the Idempotency-Key header and the number, then shows the waiting panel', async () => {
    const user = userEvent.setup();
    const calls = servePay([ok202]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await payWith(user);
    await within(panel()).findByText('Prompt sent to 254*******149');
    expect(calls).toHaveLength(1);
    expect(isValidIdempotencyKey(calls[0].key)).toBe(true);
    expect(JSON.parse(calls[0].body)).toEqual({ phone_number: '254712345678' });
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
    await payWith(user);
    await waitFor(() =>
      expect(liveMessage()).toHaveTextContent('Check your phone and enter your M-Pesa PIN.'),
    );
    await advance(3000);
    await waitFor(() => expect(panel()).toHaveAttribute('data-kind', 'paid'));
    expect(liveMessage()).toHaveTextContent('');
  });

  it('moves focus to the panel headline after the 202', async () => {
    const user = userEvent.setup();
    servePay([ok202]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await payWith(user);
    const heading = await within(panel()).findByRole('heading', {
      name: 'Check your phone and enter your M-Pesa PIN',
    });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('shows "Sending request" and warns before leaving while paying', async () => {
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
    await payWith(user);
    const sending = await screen.findByRole('button', { name: /Sending request/ });
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

  it('after a network failure keeps the key and number, disables the field and resends them', async () => {
    const user = userEvent.setup();
    const calls = servePay([() => HttpResponse.error(), () => HttpResponse.error(), ok202]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await payWith(user);
    expect(
      await within(panel()).findByRole('button', { name: /Check payment request/ }),
    ).toBeEnabled();
    expect(liveMessage()).toHaveTextContent(
      'We could not confirm that the payment request was sent. Check the request to avoid sending it twice.',
    );
    expect(phoneField()).toBeDisabled();
    expect(phoneField()).toHaveValue('0712 345 678');
    await checkRequest(user);
    await waitFor(() => expect(calls).toHaveLength(2));
    // "Check payment request" sends at once, without the confirmation dialog.
    expect(screen.queryByRole('dialog')).toBeNull();
    await checkRequest(user);
    await within(panel()).findByText('Prompt sent to 254*******149');
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => c.key)).size).toBe(1);
    expect(new Set(calls.map((c) => c.body)).size).toBe(1);
    expect(JSON.parse(calls[0].body)).toEqual({ phone_number: '254712345678' });
  });

  it('after a timeout keeps the key; a 202 to "Check payment request" clears it', async () => {
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
    await payWith(user);
    await advance(21_000);
    expect(phoneField()).toBeDisabled();
    await checkRequest(user);
    await within(panel()).findByText('Prompt sent to 254*******149');
    expect(calls).toHaveLength(2);
    expect(calls[1].key).toBe(calls[0].key);
    expect(calls[1].body).toBe(calls[0].body);
  });

  it('a definitive answer to "Check payment request" re-enables the field and the next key is new', async () => {
    const user = userEvent.setup();
    const calls = servePay([
      () => HttpResponse.error(),
      () => errorResponse(502, 'payment_request_failed'),
      ok202,
    ]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await payWith(user);
    await checkRequest(user);
    await within(panel()).findByText('Could not start the M-Pesa prompt. Please try again.');
    expect(phoneField()).toBeEnabled();
    expect(payButton()).toHaveTextContent('Pay with M-Pesa');
    await payWith(user);
    await within(panel()).findByText('Prompt sent to 254*******149');
    expect(calls).toHaveLength(3);
    expect(calls[1].key).toBe(calls[0].key);
    expect(calls[2].key).not.toBe(calls[1].key);
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
    await payWith(user);
    expect(
      await within(panel()).findByText('Could not start the M-Pesa prompt. Please try again.'),
    ).toBeVisible();
    expect(payButton()).toHaveTextContent('Pay with M-Pesa');
    await payWith(user);
    // The 202 is followed by a cancelled payment: "Try again" is a new deliberate attempt.
    // The next poll (3 seconds later) reports the cancelled payment.
    await within(panel()).findByRole('button', { name: /Try again/ }, { timeout: 6000 });
    await payWith(user);
    await waitFor(() => expect(calls).toHaveLength(3));
    const keys = calls.map((c) => c.key);
    expect(keys.every(isValidIdempotencyKey)).toBe(true);
    expect(new Set(keys).size).toBe(3);
  });

  it('editing the number after an error gives the next attempt a new key and the new number', async () => {
    const user = userEvent.setup();
    const calls = servePay([() => errorResponse(409, 'idempotency_key_reused'), ok202]);
    serveOrder((call) => (call === 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await payWith(user, '0712 345 678');
    await within(panel()).findByText(
      'This request was already used with a different number. Start a new payment attempt.',
    );
    // The form stays usable for a new attempt.
    expect(phoneField()).toBeEnabled();
    expect(payButton()).toBeEnabled();
    await payWith(user, '0722 000 111');
    await within(panel()).findByText('Prompt sent to 254*******149');
    expect(calls).toHaveLength(2);
    expect(calls[1].key).not.toBe(calls[0].key);
    expect(JSON.parse(calls[1].body)).toEqual({ phone_number: '254722000111' });
  });

  it('never stores the key or the number, nor puts them in the URL, a query key or the console', async () => {
    const user = userEvent.setup();
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((name) =>
      vi.spyOn(console, /** @type {'log'} */ (name)),
    );
    const calls = servePay([() => HttpResponse.error()]);
    serveOrder(() => makeOrder());
    const { router } = await openOrder();
    await payWith(user, '0712 345 678');
    await within(panel()).findByRole('button', { name: /Check payment request/ });
    const key = /** @type {string} */ (calls[0].key);
    expect(key).toBeTruthy();
    const secrets = [key, '254712345678', '0712 345 678', '0712345678', '712345678'];
    const stored = [window.sessionStorage, window.localStorage].flatMap((store) =>
      Object.keys(store).map((name) => `${name}=${store.getItem(name)}`),
    );
    const where = {
      storage: stored.join('\n'),
      url:
        router.state.location.pathname + router.state.location.search + router.state.location.hash,
      routerState: JSON.stringify(router.state.location.state ?? null),
      queryKeys: JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ),
      mutationVariables: JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state.variables) ?? null,
      ),
      mutationErrors: queryClient
        .getMutationCache()
        .getAll()
        .map((m) => String(m.state.error?.message ?? ''))
        .join('\n'),
      console: JSON.stringify(spies.flatMap((spy) => spy.mock.calls)),
    };
    for (const [place, value] of Object.entries(where)) {
      for (const secret of secrets) {
        expect(value.includes(secret), `${place} contains ${secret}`).toBe(false);
      }
    }
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
      expect(within(panel()).queryByLabelText('M-Pesa phone number')).toBeNull();
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
    await payWith(user);
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
    await payWith(user);
    await waitFor(() => expect(panel()).toHaveAttribute('data-kind', 'awaiting_phone'));
  });

  it.each([
    ['invalid_phone', 'Enter a valid Safaricom number, for example 0712 345 678.'],
    ['phone_required', 'Enter the M-Pesa number to send the payment prompt to.'],
  ])('422 %s shows on the field and moves focus there', async (code, text) => {
    const user = userEvent.setup();
    const calls = servePay([() => errorResponse(422, code), ok202]);
    serveOrder((call) => (call <= 1 ? makeOrder() : waitingOrder()));
    await openOrder();
    await payWith(user);
    await waitFor(() => expect(phoneField()).toHaveFocus());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(phoneField()).toHaveAttribute('aria-invalid', 'true');
    expect(phoneField()).toHaveAccessibleDescription(expect.stringContaining(text));
    expect(phoneField()).toBeEnabled();
    expect(liveMessage()).toHaveTextContent('');
    // A corrected number is a new attempt with a new key.
    await payWith(user, '0722 000 111');
    await within(panel()).findByText('Prompt sent to 254*******149');
    expect(calls[1].key).not.toBe(calls[0].key);
  });

  it('a short wait (30 seconds) counts down on the button and is announced once', async () => {
    const user = fakeTimers();
    const calls = servePay([
      () => errorResponse(429, 'too_many_payment_attempts', { headers: { 'Retry-After': '30' } }),
      ok202,
    ]);
    serveOrder(() => makeOrder({}, { secondsLeft: 280 }));
    await openOrder();
    const region = liveMessage();
    /** @type {string[]} */
    const heard = [];
    const observer = new MutationObserver(() => heard.push(region.textContent ?? ''));
    observer.observe(region, { childList: true, characterData: true, subtree: true });
    await payWith(user);
    const text = 'Too many payment attempts for this phone number. Try again in 30 seconds.';
    await waitFor(() => expect(liveMessage()).toHaveTextContent(text));
    const waiting = within(panel()).getByRole('button', { name: /Try again in 30 s/ });
    expect(waiting).toBeDisabled();
    for (let i = 0; i < 10; i += 1) await advance(1000);
    expect(within(panel()).getByRole('button', { name: /Try again in 20 s/ })).toBeDisabled();
    await advance(21_000);
    expect(payButton()).toBeEnabled();
    observer.disconnect();
    expect(heard.filter(Boolean)).toEqual([text]);
    // The button's own region says only when the wait is over.
    const buttonRegion = /** @type {HTMLElement} */ (
      panel().querySelector('[data-countdown-status]')
    );
    expect(buttonRegion).toHaveTextContent('You can try again now.');
    expect(calls).toHaveLength(1);
  });

  it.each([
    [
      'too_many_buyer_payment_attempts',
      '600',
      'You have made too many payment attempts. Try again in about 10 minutes.',
    ],
    [
      'too_many_phone_numbers',
      '7200',
      'You have used too many different phone numbers today. Use a number you already used, or try again in about 2 hours.',
    ],
  ])('a long wait (%s, %s seconds) disables Pay until the end time', async (code, after, text) => {
    const user = fakeTimers();
    const seconds = Number(after);
    servePay([() => errorResponse(429, code, { headers: { 'Retry-After': after } }), ok202]);
    serveOrder(() => makeOrder({}, { secondsLeft: 10_800 }));
    await openOrder(PATH, { sessionSeconds: 86_400 });
    const region = liveMessage();
    /** @type {string[]} */
    const heard = [];
    const observer = new MutationObserver(() => heard.push(region.textContent ?? ''));
    observer.observe(region, { childList: true, characterData: true, subtree: true });
    await payWith(user);
    await waitFor(() => expect(liveMessage()).toHaveTextContent(text));
    // No second by second countdown: the button keeps its label and stays disabled.
    expect(payButton()).toHaveTextContent('Pay with M-Pesa');
    expect(payButton()).toBeDisabled();
    for (let i = 0; i < 4; i += 1) await advance(15_000);
    expect(payButton()).toBeDisabled();
    // Jump to just before the end: the 15 second check keeps it disabled.
    // 60 seconds have passed; jump to 25 seconds before the end.
    vi.setSystemTime(Date.now() + (seconds - 100) * 1000);
    await advance(15_000);
    expect(payButton()).toBeDisabled();
    // Past the end: the next 15 second check enables Pay again.
    await advance(30_000);
    await waitFor(() => expect(payButton()).toBeEnabled());
    observer.disconnect();
    expect(heard.filter(Boolean)).toEqual([text, 'You can try again now.']);
  });

  it('a long wait also ends on window focus after the end time', async () => {
    const user = fakeTimers();
    servePay([
      () => errorResponse(429, 'too_many_phone_numbers', { headers: { 'Retry-After': '7200' } }),
    ]);
    serveOrder(() => makeOrder({}, { secondsLeft: 10_800 }));
    await openOrder(PATH, { sessionSeconds: 86_400 });
    await payWith(user);
    await waitFor(() => expect(payButton()).toBeDisabled());
    vi.setSystemTime(Date.now() + 7300 * 1000);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(payButton()).toBeEnabled();
  });

  it('a 429 without Retry-After waits 60 seconds', async () => {
    const user = fakeTimers();
    servePay([() => errorResponse(429, 'too_many_buyer_payment_attempts')]);
    serveOrder(() => makeOrder({}, { secondsLeft: 280 }));
    await openOrder();
    await payWith(user);
    await waitFor(() =>
      expect(liveMessage()).toHaveTextContent(
        'You have made too many payment attempts. Try again in 60 seconds.',
      ),
    );
    expect(within(panel()).getByRole('button', { name: /Try again in 60 s/ })).toBeDisabled();
  });

  it('removes the long wait timer on unmount', async () => {
    const user = fakeTimers();
    servePay([
      () => errorResponse(429, 'too_many_phone_numbers', { headers: { 'Retry-After': '7200' } }),
    ]);
    serveOrder(() => makeOrder({}, { secondsLeft: 280 }));
    const { unmount } = await openOrder();
    const setSpy = vi.spyOn(globalThis, 'setInterval');
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    await payWith(user);
    await waitFor(() => expect(payButton()).toBeDisabled());
    const recheck = setSpy.mock.calls
      .map((call, i) => ({ delay: call[1], id: setSpy.mock.results[i].value }))
      .filter((timer) => timer.delay === 15_000)
      .map((timer) => timer.id);
    expect(recheck.length).toBeGreaterThan(0);
    unmount();
    const cleared = clearSpy.mock.calls.map((call) => call[0]);
    for (const id of recheck) expect(cleared).toContain(id);
    setSpy.mockRestore();
    clearSpy.mockRestore();
  });
});

describe('OrderScreen: the prompt target and retry states', () => {
  it('shows the masked target; the test environment line only when it differs', async () => {
    serveOrder(() =>
      waitingOrder({
        payment: makePayment('initiated', {
          phone_masked: '254*******678',
          stk_target_masked: '254*******149',
        }),
      }),
    );
    await openOrder();
    expect(within(panel()).getByText('Prompt sent to 254*******149')).toBeVisible();
    expect(within(panel()).getByTestId('test-target-note')).toHaveTextContent(
      'In this test environment the prompt goes to a fixed test number instead of 254*******678.',
    );
    expect(
      within(within(panel()).getByTestId('test-target-note')).getByText(/test environment/),
    ).toBeVisible();
  });

  it('shows no test environment line when the numbers are equal', async () => {
    serveOrder(() => waitingOrder());
    await openOrder();
    expect(within(panel()).getByText('Prompt sent to 254*******149')).toBeVisible();
    expect(within(panel()).queryByTestId('test-target-note')).toBeNull();
    expect(panel()).not.toHaveTextContent('test environment');
  });

  it.each([
    ['payment_cancelled', 'cancelled'],
    ['payment_failed', 'failed'],
    ['payment_timeout', 'timeout'],
  ])(
    '%s brings the field back with the last typed number; a changed number gets a new key',
    async (kind, paymentStatus) => {
      const user = fakeTimers();
      const calls = servePay([ok202]);
      serveOrder((call) =>
        call === 1 ? makeOrder() : makeOrder({ payment: makePayment(paymentStatus) }),
      );
      await openOrder();
      await payWith(user, '0712 345 678');
      await within(panel()).findByText('Prompt sent to 254*******149');
      // The 202 shows the open prompt; the next poll reports the result.
      await advance(3000);
      await waitFor(() => expect(panel()).toHaveAttribute('data-kind', kind), { timeout: 5000 });
      expect(
        within(panel()).getByText('Use the same number or enter a different one'),
      ).toBeVisible();
      expect(phoneField()).toHaveValue('0712 345 678');
      expect(phoneField()).toBeEnabled();
      expect(payButton()).toHaveTextContent('Try again');
      await payWith(user, '0722 000 111');
      await waitFor(() => expect(calls).toHaveLength(2));
      expect(calls[1].key).not.toBe(calls[0].key);
      expect(JSON.parse(calls[1].body)).toEqual({ phone_number: '254722000111' });
    },
  );
});

describe('OrderScreen: the number is forgotten', () => {
  it('after unmount the field is empty again', async () => {
    const user = userEvent.setup();
    serveOrder(() => makeOrder());
    const { unmount } = await openOrder();
    await user.type(phoneField(), '0712 345 678');
    expect(phoneField()).toHaveValue('0712 345 678');
    unmount();
    await openOrder();
    expect(phoneField()).toHaveValue('');
  });

  it('after logout and a new sign in the field is empty again', async () => {
    const user = userEvent.setup();
    serveOrder(() => makeOrder());
    const { router, unmount } = await openOrder();
    await user.type(phoneField(), '0712 345 678');
    act(() => logout());
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(document.body.textContent).not.toContain('0712 345 678');
    expect(document.querySelector('input[type="tel"]')).toBeNull();
    unmount();
    await openOrder();
    expect(phoneField()).toHaveValue('');
    const stored = [window.sessionStorage, window.localStorage]
      .flatMap((store) => Object.keys(store).map((name) => store.getItem(name)))
      .join('\n');
    expect(stored).not.toMatch(/712345678|712 345 678/);
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
