import { describe, expect, it } from 'vitest';
import { nextPollInterval, POLL_INTERVAL_MS, POLL_WINDOW_MS } from './polling';

const START = 1_000_000;

/** @param {string} status @param {string | null} paymentStatus */
const order = (status, paymentStatus) => ({
  status,
  is_expired: false,
  expires_at: '2026-10-20T09:05:00Z',
  can_pay: false,
  can_cancel: false,
  payment: paymentStatus ? { status: paymentStatus, attempts: 1 } : null,
});

describe('nextPollInterval', () => {
  it('uses the contract values: every 3 seconds for up to 150 seconds', () => {
    expect(POLL_INTERVAL_MS).toBe(3000);
    expect(POLL_WINDOW_MS).toBe(150_000);
  });

  it.each(['initiating', 'initiated'])('polls while the payment is %s', (status) => {
    expect(
      nextPollInterval({
        order: /** @type {any} */ (order('pending_payment', status)),
        windowStartedAt: START,
        nowMs: START,
      }),
    ).toBe(POLL_INTERVAL_MS);
  });

  it('keeps polling a completed payment until the order turns paid', () => {
    expect(
      nextPollInterval({
        order: /** @type {any} */ (order('pending_payment', 'completed')),
        windowStartedAt: START,
        nowMs: START,
      }),
    ).toBe(POLL_INTERVAL_MS);
  });

  it('polls just inside the window and stops just outside it', () => {
    const open = /** @type {any} */ (order('pending_payment', 'initiated'));
    expect(
      nextPollInterval({ order: open, windowStartedAt: START, nowMs: START + POLL_WINDOW_MS - 1 }),
    ).toBe(POLL_INTERVAL_MS);
    expect(
      nextPollInterval({ order: open, windowStartedAt: START, nowMs: START + POLL_WINDOW_MS }),
    ).toBe(false);
    expect(
      nextPollInterval({ order: open, windowStartedAt: START, nowMs: START + POLL_WINDOW_MS + 1 }),
    ).toBe(false);
  });

  it.each([
    ['paid', 'completed'],
    ['payment_failed', 'failed'],
    ['expired', 'initiated'],
    ['cancelled', 'cancelled'],
    ['needs_reconciliation', 'completed'],
  ])('stops for the final order status %s', (status, paymentStatus) => {
    expect(
      nextPollInterval({
        order: /** @type {any} */ (order(status, paymentStatus)),
        windowStartedAt: START,
        nowMs: START,
      }),
    ).toBe(false);
  });

  it.each(['failed', 'cancelled', 'timeout'])(
    'stops when the payment ended (%s) and the order is still pending',
    (paymentStatus) => {
      expect(
        nextPollInterval({
          order: /** @type {any} */ (order('pending_payment', paymentStatus)),
          windowStartedAt: START,
          nowMs: START,
        }),
      ).toBe(false);
    },
  );

  it('does not poll without a payment or without an order', () => {
    expect(
      nextPollInterval({
        order: /** @type {any} */ (order('pending_payment', null)),
        windowStartedAt: START,
        nowMs: START,
      }),
    ).toBe(false);
    expect(nextPollInterval({ order: undefined, windowStartedAt: START, nowMs: START })).toBe(
      false,
    );
  });
});
