/**
 * What the payment screen does after POST /orders/{id}/pay fails (F3, extended for the payment
 * number in identity v2, prompt 2). Each error becomes a message and an action:
 * - `refetch`: reload the order and show its real state;
 * - `cancel_hint`: payment cannot start; point to the Cancel button;
 * - `wait`: disable Pay for `waitSeconds` (from Retry-After; 60 when a 429 has no header);
 * - `retry_same_key`: the result is unknown (network failure, timeout); the next click sends
 *   the same Idempotency-Key and the same number, so the server replays and never sends a
 *   second prompt;
 * - `new_key`: a definitive failure; the next deliberate attempt uses a new key;
 * - `none`: only show the message.
 * `field: 'phone'` puts the message on the number field instead of the status region.
 */
import { ApiError, getUserMessage } from '@/api/errors';
import { PHONE_FIELD_TEXT } from './phone';
import { formatWait, waitSecondsFrom } from './waitTime';

/** @typedef {'refetch' | 'cancel_hint' | 'wait' | 'retry_same_key' | 'new_key' | 'none'} PayAction */

/**
 * @typedef {object} PayErrorView
 * @property {string} message
 * @property {PayAction} action
 * @property {'phone'} [field]
 * @property {number} [waitSeconds]
 */

export const PAY_ERROR_TEXT = Object.freeze({
  tooClose: 'There is not enough time left to start a payment. Cancel this order and start again.',
  expired: 'This order has expired.',
  inProgress: 'A payment is already in progress. Check your phone.',
  notPayable: 'This order can no longer be paid. Its current state is shown below.',
  maxAttempts: 'You have tried to pay for this order 3 times. Cancel it and start a new order.',
  /** @param {string} wait  formatWait() */
  tooManyAttempts: (wait) =>
    `Too many payment attempts for this phone number. Try again in ${wait}.`,
  /** @param {string} wait */
  tooManyBuyerAttempts: (wait) => `You have made too many payment attempts. Try again in ${wait}.`,
  /** @param {string} wait */
  tooManyNumbers: (wait) =>
    `You have used too many different phone numbers today. Use a number you already used, or try again in ${wait}.`,
  keyReused: 'This request was already used with a different number. Start a new payment attempt.',
  invalidPhone: PHONE_FIELD_TEXT.invalid,
  phoneRequired: PHONE_FIELD_TEXT.empty,
  unavailable: 'Payments are temporarily unavailable. Please try again soon.',
  requestFailed: 'Could not start the M-Pesa prompt. Please try again.',
  uncertain:
    'We could not confirm that the payment request was sent. Check the request to avoid sending it twice.',
  notFound: 'This order could not be found.',
});

/**
 * @param {ApiError} error
 * @param {(wait: string) => string} text
 * @returns {PayErrorView}
 */
function waitFor(error, text) {
  const waitSeconds = waitSecondsFrom(error.retryAfter);
  return { message: text(formatWait(waitSeconds)), action: 'wait', waitSeconds };
}

/**
 * @param {unknown} error
 * @returns {PayErrorView}
 */
export function mapPayError(error) {
  if (!(error instanceof ApiError)) return { message: getUserMessage(error), action: 'none' };
  switch (error.code) {
    case 'network_error':
    case 'timeout':
      return { message: PAY_ERROR_TEXT.uncertain, action: 'retry_same_key' };
    case 'invalid_phone':
      return { message: PAY_ERROR_TEXT.invalidPhone, action: 'none', field: 'phone' };
    case 'phone_required':
      return { message: PAY_ERROR_TEXT.phoneRequired, action: 'none', field: 'phone' };
    case 'idempotency_key_reused':
      return { message: PAY_ERROR_TEXT.keyReused, action: 'new_key' };
    case 'order_not_payable':
      return { message: PAY_ERROR_TEXT.notPayable, action: 'refetch' };
    case 'order_expiring':
      return error.reason === 'too_close'
        ? { message: PAY_ERROR_TEXT.tooClose, action: 'cancel_hint' }
        : { message: PAY_ERROR_TEXT.expired, action: 'refetch' };
    case 'payment_in_progress':
      return { message: PAY_ERROR_TEXT.inProgress, action: 'refetch' };
    case 'max_attempts_reached':
      return { message: PAY_ERROR_TEXT.maxAttempts, action: 'cancel_hint' };
    case 'too_many_payment_attempts':
      return waitFor(error, PAY_ERROR_TEXT.tooManyAttempts);
    case 'too_many_buyer_payment_attempts':
      return waitFor(error, PAY_ERROR_TEXT.tooManyBuyerAttempts);
    case 'too_many_phone_numbers':
      return waitFor(error, PAY_ERROR_TEXT.tooManyNumbers);
    case 'payment_request_failed':
      return { message: PAY_ERROR_TEXT.requestFailed, action: 'new_key' };
    case 'order_not_found':
      return { message: PAY_ERROR_TEXT.notFound, action: 'refetch' };
    case 'idempotency_key_required':
    case 'invalid_idempotency_key':
      return { message: getUserMessage(error), action: 'new_key' };
    default:
      if (error.status === 503 || error.code === 'payments_unavailable') {
        // As in F3: wait only when the server says how long.
        return error.retryAfter && error.retryAfter > 0
          ? {
              message: PAY_ERROR_TEXT.unavailable,
              action: 'wait',
              waitSeconds: Math.ceil(error.retryAfter),
            }
          : { message: PAY_ERROR_TEXT.unavailable, action: 'wait' };
      }
      if (error.status === 429) {
        return {
          message: getUserMessage(error),
          action: 'wait',
          waitSeconds: waitSecondsFrom(error.retryAfter),
        };
      }
      return { message: getUserMessage(error), action: 'none' };
  }
}

/**
 * Whether a failed pay request got a definitive answer from the server (any HTTP status). Only
 * then is the Idempotency-Key discarded; after a network failure or a timeout (status 0) the
 * same key (and number) is kept for the next click.
 * @param {unknown} error
 */
export function isDefinitivePayError(error) {
  return !(error instanceof ApiError) || error.status !== 0;
}
