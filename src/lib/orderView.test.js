import { describe, expect, it } from 'vitest';
import { deriveOrderView, hasOpenPayment, remainingSecondsUntil } from './orderView';
import { MIN_SECONDS_BEFORE_EXPIRY_TO_PAY } from './constants';

const SERVER_NOW = Date.parse('2026-10-20T09:00:00Z');
const EXPIRES = '2026-10-20T09:05:00Z'; // 300 seconds after SERVER_NOW

/**
 * @param {Record<string, any>} [overrides]
 * @param {Record<string, any> | null} [payment]
 */
function order(overrides = {}, payment = null) {
  return {
    status: 'pending_payment',
    is_expired: false,
    expires_at: EXPIRES,
    can_pay: true,
    can_cancel: true,
    payment,
    ...overrides,
  };
}

/** @param {string} status @param {Record<string, any>} [extra] */
const payment = (status, extra = {}) => ({
  status,
  attempts: 1,
  result_desc: null,
  status_message: 'Message from the server',
  ...extra,
});

/** The clock where the device agrees with the server. */
const inSync = { nowMs: SERVER_NOW, offsetMs: 0 };

describe('remainingSecondsUntil (server clock)', () => {
  it.each([
    ['in sync', SERVER_NOW, 0],
    // The device is 5 minutes behind: its clock reads 08:55, the offset is +5 minutes.
    ['device 5 minutes behind', SERVER_NOW - 300_000, 300_000],
    // The device is 5 minutes ahead: its clock reads 09:05, the offset is -5 minutes.
    ['device 5 minutes ahead', SERVER_NOW + 300_000, -300_000],
  ])('counts 300 seconds when the %s', (_name, nowMs, offsetMs) => {
    expect(remainingSecondsUntil(EXPIRES, { nowMs, offsetMs })).toBe(300);
  });

  it('rounds down to whole seconds', () => {
    expect(remainingSecondsUntil(EXPIRES, { nowMs: SERVER_NOW + 999, offsetMs: 0 })).toBe(299);
    expect(remainingSecondsUntil(EXPIRES, { nowMs: SERVER_NOW + 1000, offsetMs: 0 })).toBe(299);
    expect(remainingSecondsUntil(EXPIRES, { nowMs: SERVER_NOW + 1001, offsetMs: 0 })).toBe(298);
  });

  it('never goes below zero', () => {
    expect(remainingSecondsUntil(EXPIRES, { nowMs: SERVER_NOW + 600_000, offsetMs: 0 })).toBe(0);
    expect(remainingSecondsUntil(EXPIRES, { nowMs: SERVER_NOW, offsetMs: 400_000 })).toBe(0);
  });

  it('is 0 for a missing or invalid expiry', () => {
    expect(remainingSecondsUntil('not a date', inSync)).toBe(0);
    expect(remainingSecondsUntil(null, inSync)).toBe(0);
    expect(remainingSecondsUntil(EXPIRES, { nowMs: SERVER_NOW, offsetMs: Number.NaN })).toBe(300);
  });
});

describe('deriveOrderView', () => {
  it.each([
    ['pay_ready', order()],
    [
      'too_close',
      order({ can_pay: false, expires_at: '2026-10-20T09:01:30Z' }), // exactly 90 s left
    ],
    ['max_attempts', order({ can_pay: false }, payment('failed', { attempts: 3 }))],
    ['awaiting_phone', order({ can_pay: false, can_cancel: false }, payment('initiating'))],
    ['awaiting_phone', order({ can_pay: false, can_cancel: false }, payment('initiated'))],
    ['awaiting_phone', order({ can_pay: false, can_cancel: false }, payment('completed'))],
    ['payment_cancelled', order({}, payment('cancelled'))],
    ['payment_failed', order({}, payment('failed', { result_desc: 'Insufficient balance' }))],
    ['payment_timeout', order({}, payment('timeout'))],
    ['paid', order({ status: 'paid', can_pay: false }, payment('completed'))],
    ['expired', order({ status: 'expired', can_pay: false })],
    ['expired', order({ is_expired: true, can_pay: false })],
    ['cancelled', order({ status: 'cancelled', can_pay: false })],
    ['under_review', order({ status: 'needs_reconciliation', can_pay: false })],
    ['closed_other', order({ status: 'payment_failed', can_pay: false })],
    ['closed_other', order({ status: 'something_new', can_pay: false })],
  ])('gives %s', (kind, value) => {
    expect(deriveOrderView(/** @type {any} */ (value), inSync).kind).toBe(kind);
  });

  it('is too_close only within the margin and only when the server says can_pay is false', () => {
    const margin = MIN_SECONDS_BEFORE_EXPIRY_TO_PAY;
    const at = (/** @type {number} */ seconds) =>
      new Date(SERVER_NOW + seconds * 1000).toISOString();
    expect(
      deriveOrderView(
        /** @type {any} */ (order({ can_pay: false, expires_at: at(margin + 1) })),
        inSync,
      ).kind,
    ).toBe('pay_ready');
    expect(
      deriveOrderView(
        /** @type {any} */ (order({ can_pay: false, expires_at: at(margin) })),
        inSync,
      ).kind,
    ).toBe('too_close');
    // The server allows paying: the client does not second guess it.
    expect(
      deriveOrderView(/** @type {any} */ (order({ can_pay: true, expires_at: at(30) })), inSync)
        .kind,
    ).toBe('pay_ready');
  });

  it('uses the server clock for too_close (device clocks 5 minutes behind and ahead)', () => {
    const value = /** @type {any} */ (
      order({ can_pay: false, expires_at: '2026-10-20T09:01:00Z' })
    );
    for (const clock of [
      { nowMs: SERVER_NOW - 300_000, offsetMs: 300_000 },
      { nowMs: SERVER_NOW + 300_000, offsetMs: -300_000 },
    ]) {
      const view = deriveOrderView(value, clock);
      expect(view.remainingSeconds).toBe(60);
      expect(view.kind).toBe('too_close');
    }
  });

  it('shows an open prompt before the attempt limit and the expiry', () => {
    const value = order(
      { can_pay: false, is_expired: true },
      payment('initiated', { attempts: 3 }),
    );
    expect(deriveOrderView(/** @type {any} */ (value), inSync).kind).toBe('awaiting_phone');
  });

  it('copies can_pay and can_cancel from the server and never forces them on', () => {
    for (const can_pay of [true, false]) {
      for (const can_cancel of [true, false]) {
        const view = deriveOrderView(/** @type {any} */ (order({ can_pay, can_cancel })), inSync);
        expect(view.canPay).toBe(can_pay);
        expect(view.canCancel).toBe(can_cancel);
      }
    }
    // A failed payment with time left does not turn Pay on when the server says no.
    const failed = order({ can_pay: false }, payment('failed', { attempts: 1 }));
    expect(deriveOrderView(/** @type {any} */ (failed), inSync).canPay).toBe(false);
    // Values that are not exactly true count as false.
    const odd = order({ can_pay: 'yes', can_cancel: 1 });
    expect(deriveOrderView(/** @type {any} */ (odd), inSync)).toMatchObject({
      canPay: false,
      canCancel: false,
    });
  });

  it('reports the remaining seconds, floored and clamped', () => {
    expect(deriveOrderView(/** @type {any} */ (order()), inSync).remainingSeconds).toBe(300);
    expect(
      deriveOrderView(/** @type {any} */ (order()), { nowMs: SERVER_NOW + 1500, offsetMs: 0 })
        .remainingSeconds,
    ).toBe(298);
    expect(
      deriveOrderView(/** @type {any} */ (order()), { nowMs: SERVER_NOW + 900_000, offsetMs: 0 })
        .remainingSeconds,
    ).toBe(0);
  });

  it('marks the waiting state and the failure reason', () => {
    const waiting = deriveOrderView(/** @type {any} */ (order({}, payment('initiated'))), inSync);
    expect(waiting.waitingForPhone).toBe(true);
    expect(waiting.headline).toBe('Check your phone and enter your M-Pesa PIN');
    const failed = deriveOrderView(
      /** @type {any} */ (order({}, payment('failed', { result_desc: 'Insufficient balance' }))),
      inSync,
    );
    expect(failed.showReason).toBe(true);
    expect(failed.waitingForPhone).toBe(false);
    const noReason = deriveOrderView(
      /** @type {any} */ (order({}, payment('failed', { result_desc: '  ' }))),
      inSync,
    );
    expect(noReason.showReason).toBe(false);
  });

  it('gives every kind a headline', () => {
    const view = deriveOrderView(/** @type {any} */ (order({ status: 'paid' })), inSync);
    expect(view.headline).toBe('Payment received (test)');
  });
});

describe('hasOpenPayment', () => {
  it('is true only for an open prompt on a pending order', () => {
    expect(hasOpenPayment(/** @type {any} */ (order({}, payment('initiated'))))).toBe(true);
    expect(hasOpenPayment(/** @type {any} */ (order({}, payment('failed'))))).toBe(false);
    expect(hasOpenPayment(/** @type {any} */ (order()))).toBe(false);
    expect(
      hasOpenPayment(/** @type {any} */ (order({ status: 'paid' }, payment('completed')))),
    ).toBe(false);
    expect(hasOpenPayment(null)).toBe(false);
  });
});
