import { describe, expect, it } from 'vitest';
import { ApiError, ERROR_MESSAGES, GENERIC_MESSAGE } from '@/api/errors';
import { isDefinitivePayError, mapPayError, PAY_ERROR_TEXT } from './payErrors';

/** @param {number} status @param {string} code @param {Record<string, any>} [extra] */
const err = (status, code, extra = {}) => new ApiError({ status, code, ...extra });

describe('mapPayError', () => {
  it.each([
    [err(409, 'order_not_payable'), 'refetch', PAY_ERROR_TEXT.notPayable],
    [
      err(409, 'order_expiring', { reason: 'too_close' }),
      'cancel_hint',
      'There is not enough time left to start a payment. Cancel this order and start again.',
    ],
    [err(409, 'order_expiring', { reason: 'expired' }), 'refetch', PAY_ERROR_TEXT.expired],
    [err(409, 'order_expiring'), 'refetch', PAY_ERROR_TEXT.expired],
    [err(409, 'payment_in_progress'), 'refetch', PAY_ERROR_TEXT.inProgress],
    [
      err(409, 'max_attempts_reached'),
      'cancel_hint',
      'You have tried to pay for this order 3 times. Cancel it and start a new order.',
    ],
    [
      err(429, 'too_many_payment_attempts', { retryAfter: 120 }),
      'wait',
      'Too many payment attempts for this phone number. Please try again later.',
    ],
    [
      err(503, 'payments_unavailable'),
      'wait',
      'Payments are temporarily unavailable. Please try again soon.',
    ],
    [
      err(503, 'service_unavailable'),
      'wait',
      'Payments are temporarily unavailable. Please try again soon.',
    ],
    [
      err(502, 'payment_request_failed'),
      'new_key',
      'Could not start the M-Pesa prompt. Please try again.',
    ],
    [err(422, 'idempotency_key_required'), 'new_key', GENERIC_MESSAGE],
    [err(422, 'invalid_idempotency_key'), 'new_key', GENERIC_MESSAGE],
    [err(404, 'order_not_found'), 'refetch', PAY_ERROR_TEXT.notFound],
    [err(0, 'network_error'), 'retry_same_key', PAY_ERROR_TEXT.uncertain],
    [err(0, 'timeout'), 'retry_same_key', PAY_ERROR_TEXT.uncertain],
    [err(429, 'rate_limited'), 'wait', ERROR_MESSAGES.rate_limited],
    [err(500, 'internal_error'), 'none', ERROR_MESSAGES.internal_error],
    [err(403, 'forbidden'), 'none', ERROR_MESSAGES.forbidden],
    [err(418, 'brand_new_code'), 'none', GENERIC_MESSAGE],
  ])('maps %s', (error, action, message) => {
    expect(mapPayError(error)).toEqual({ action, message });
  });

  it('maps a non API error to the generic message', () => {
    expect(mapPayError(new Error('boom'))).toEqual({ action: 'none', message: GENERIC_MESSAGE });
  });
});

describe('isDefinitivePayError', () => {
  it('is false only for network failures and timeouts (status 0)', () => {
    expect(isDefinitivePayError(err(0, 'network_error'))).toBe(false);
    expect(isDefinitivePayError(err(0, 'timeout'))).toBe(false);
    for (const status of [400, 404, 409, 422, 429, 500, 502, 503]) {
      expect(isDefinitivePayError(err(status, 'x'))).toBe(true);
    }
  });
});
