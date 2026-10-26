import { describe, expect, it } from 'vitest';
import { ApiError, ERROR_MESSAGES, GENERIC_MESSAGE } from '@/api/errors';
import { isDefinitivePayError, mapPayError, PAY_ERROR_TEXT } from './payErrors';

/** @param {number} status @param {string} code @param {Record<string, any>} [extra] */
const err = (status, code, extra = {}) => new ApiError({ status, code, ...extra });

describe('mapPayError', () => {
  it.each([
    [err(409, 'order_not_payable'), { action: 'refetch', message: PAY_ERROR_TEXT.notPayable }],
    [
      err(409, 'order_expiring', { reason: 'too_close' }),
      {
        action: 'cancel_hint',
        message:
          'There is not enough time left to start a payment. Cancel this order and start again.',
      },
    ],
    [
      err(409, 'order_expiring', { reason: 'expired' }),
      { action: 'refetch', message: PAY_ERROR_TEXT.expired },
    ],
    [err(409, 'order_expiring'), { action: 'refetch', message: PAY_ERROR_TEXT.expired }],
    [err(409, 'payment_in_progress'), { action: 'refetch', message: PAY_ERROR_TEXT.inProgress }],
    [
      err(409, 'max_attempts_reached'),
      {
        action: 'cancel_hint',
        message: 'You have tried to pay for this order 3 times. Cancel it and start a new order.',
      },
    ],
    [
      err(503, 'payments_unavailable'),
      {
        action: 'wait',
        message: 'Payments are temporarily unavailable. Please try again soon.',
      },
    ],
    [
      err(503, 'payments_unavailable', { retryAfter: 45 }),
      {
        action: 'wait',
        waitSeconds: 45,
        message: 'Payments are temporarily unavailable. Please try again soon.',
      },
    ],
    [
      err(503, 'service_unavailable'),
      {
        action: 'wait',
        message: 'Payments are temporarily unavailable. Please try again soon.',
      },
    ],
    [
      err(502, 'payment_request_failed'),
      { action: 'new_key', message: 'Could not start the M-Pesa prompt. Please try again.' },
    ],
    [err(422, 'idempotency_key_required'), { action: 'new_key', message: GENERIC_MESSAGE }],
    [err(422, 'invalid_idempotency_key'), { action: 'new_key', message: GENERIC_MESSAGE }],
    [err(404, 'order_not_found'), { action: 'refetch', message: PAY_ERROR_TEXT.notFound }],
    [
      err(0, 'network_error'),
      {
        action: 'retry_same_key',
        message:
          'We could not confirm that the payment request was sent. Check the request to avoid sending it twice.',
      },
    ],
    [err(0, 'timeout'), { action: 'retry_same_key', message: PAY_ERROR_TEXT.uncertain }],
    [
      err(422, 'invalid_phone'),
      {
        action: 'none',
        field: 'phone',
        message: 'Enter a valid Safaricom number, for example 0712 345 678.',
      },
    ],
    [
      err(422, 'phone_required'),
      {
        action: 'none',
        field: 'phone',
        message: 'Enter the M-Pesa number to send the payment prompt to.',
      },
    ],
    [
      err(409, 'idempotency_key_reused'),
      {
        action: 'new_key',
        message:
          'This request was already used with a different number. Start a new payment attempt.',
      },
    ],
    [
      err(429, 'too_many_payment_attempts', { retryAfter: 30 }),
      {
        action: 'wait',
        waitSeconds: 30,
        message: 'Too many payment attempts for this phone number. Try again in 30 seconds.',
      },
    ],
    [
      err(429, 'too_many_payment_attempts'),
      {
        action: 'wait',
        waitSeconds: 60,
        message: 'Too many payment attempts for this phone number. Try again in 60 seconds.',
      },
    ],
    [
      err(429, 'too_many_buyer_payment_attempts', { retryAfter: 600 }),
      {
        action: 'wait',
        waitSeconds: 600,
        message: 'You have made too many payment attempts. Try again in about 10 minutes.',
      },
    ],
    [
      err(429, 'too_many_phone_numbers', { retryAfter: 7200 }),
      {
        action: 'wait',
        waitSeconds: 7200,
        message:
          'You have used too many different phone numbers today. Use a number you already used, or try again in about 2 hours.',
      },
    ],
    [
      err(429, 'rate_limited'),
      { action: 'wait', waitSeconds: 60, message: ERROR_MESSAGES.rate_limited },
    ],
    [err(500, 'internal_error'), { action: 'none', message: ERROR_MESSAGES.internal_error }],
    [err(403, 'forbidden'), { action: 'none', message: ERROR_MESSAGES.forbidden }],
    [err(418, 'brand_new_code'), { action: 'none', message: GENERIC_MESSAGE }],
  ])('maps %s', (error, expected) => {
    expect(mapPayError(error)).toEqual(expected);
  });

  it('maps a non API error to the generic message', () => {
    expect(mapPayError(new Error('boom'))).toEqual({ action: 'none', message: GENERIC_MESSAGE });
  });

  it('has a table message for each new payment code', () => {
    for (const code of [
      'invalid_phone',
      'phone_required',
      'idempotency_key_reused',
      'too_many_payment_attempts',
      'too_many_buyer_payment_attempts',
      'too_many_phone_numbers',
    ]) {
      expect(ERROR_MESSAGES[/** @type {keyof typeof ERROR_MESSAGES} */ (code)]).toBeTruthy();
    }
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
