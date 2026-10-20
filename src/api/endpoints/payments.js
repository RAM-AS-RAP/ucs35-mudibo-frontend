import { api, unwrap } from '../client';
import { isValidIdempotencyKey } from '@/lib/idempotency';

/**
 * The 202 answer of POST /orders/{id}/pay (PaymentStartOut): the order plus `message` ("Check
 * your phone and enter your M-Pesa PIN.") and `prompt` (the masked phone the prompt went to).
 * @typedef {import('./orders').Order & { message: string, prompt: string }} PaymentStart
 */

/**
 * POST /api/v1/orders/{order_id}/pay (buyer): sends an M-Pesa STK prompt in the Safaricom
 * sandbox. The amount and the phone number always come from the server. This is the only place
 * that sets the Idempotency-Key header, and the request has no body. Sending the same key again
 * returns the current state with 202 and sends no second prompt.
 * Errors: 404; 409 order_not_payable, order_expiring (reason expired or too_close),
 * payment_in_progress, max_attempts_reached; 429 too_many_payment_attempts; 503
 * payments_unavailable; 502 payment_request_failed; 422 idempotency_key_required or
 * invalid_idempotency_key.
 * @param {string} orderId
 * @param {string} idempotencyKey  from newIdempotencyKey() (lib/idempotency.js)
 * @returns {Promise<PaymentStart>}
 */
export async function payOrder(orderId, idempotencyKey) {
  if (!isValidIdempotencyKey(idempotencyKey)) {
    throw new TypeError('payOrder needs a valid idempotency key.');
  }
  const result = await unwrap(
    api.POST('/api/v1/orders/{order_id}/pay', {
      params: { path: { order_id: orderId }, header: { 'Idempotency-Key': idempotencyKey } },
    }),
  );
  return /** @type {PaymentStart} */ (/** @type {unknown} */ (result));
}
