/**
 * What the payment screen does after POST /orders/{id}/pay fails (F3). Each error becomes a
 * message for the live region and an action:
 * - `refetch`: reload the order and show its real state;
 * - `cancel_hint`: payment cannot start; point to the Cancel button;
 * - `wait`: disable Pay for Retry-After seconds when given;
 * - `retry_same_key`: the result is unknown (network failure, timeout); the next click sends
 *   the same Idempotency-Key, so the server replays and never sends a second prompt;
 * - `new_key`: a definitive failure; the next deliberate attempt uses a new key;
 * - `none`: only show the message.
 */
import { ApiError, getUserMessage } from '@/api/errors';

/** @typedef {'refetch' | 'cancel_hint' | 'wait' | 'retry_same_key' | 'new_key' | 'none'} PayAction */

export const PAY_ERROR_TEXT = Object.freeze({
  tooClose: 'There is not enough time left to start a payment. Cancel this order and start again.',
  expired: 'This order has expired.',
  inProgress: 'A payment is already in progress. Check your phone.',
  notPayable: 'This order can no longer be paid. Its current state is shown below.',
  maxAttempts: 'You have tried to pay for this order 3 times. Cancel it and start a new order.',
  tooManyAttempts: 'Too many payment attempts for this phone number. Please try again later.',
  unavailable: 'Payments are temporarily unavailable. Please try again soon.',
  requestFailed: 'Could not start the M-Pesa prompt. Please try again.',
  uncertain:
    'We could not confirm whether the payment request was sent. Press "Check payment request" to find out. You will not get a second prompt.',
  notFound: 'This order could not be found.',
});

/**
 * @param {unknown} error
 * @returns {{ message: string, action: PayAction }}
 */
export function mapPayError(error) {
  if (!(error instanceof ApiError)) return { message: getUserMessage(error), action: 'none' };
  switch (error.code) {
    case 'network_error':
    case 'timeout':
      return { message: PAY_ERROR_TEXT.uncertain, action: 'retry_same_key' };
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
      return { message: PAY_ERROR_TEXT.tooManyAttempts, action: 'wait' };
    case 'payments_unavailable':
      return { message: PAY_ERROR_TEXT.unavailable, action: 'wait' };
    case 'payment_request_failed':
      return { message: PAY_ERROR_TEXT.requestFailed, action: 'new_key' };
    case 'order_not_found':
      return { message: PAY_ERROR_TEXT.notFound, action: 'refetch' };
    case 'idempotency_key_required':
    case 'invalid_idempotency_key':
      return { message: getUserMessage(error), action: 'new_key' };
    default:
      if (error.status === 503) return { message: PAY_ERROR_TEXT.unavailable, action: 'wait' };
      if (error.status === 429) return { message: getUserMessage(error), action: 'wait' };
      return { message: getUserMessage(error), action: 'none' };
  }
}

/**
 * Whether a failed pay request got a definitive answer from the server (any HTTP status). Only
 * then is the Idempotency-Key discarded; after a network failure or a timeout (status 0) the
 * same key is kept for the next click.
 * @param {unknown} error
 */
export function isDefinitivePayError(error) {
  return !(error instanceof ApiError) || error.status !== 0;
}
