import { api, unwrap } from '../client';
import { isValidIdempotencyKey } from '@/lib/idempotency';
import { normalizePhone } from '@/lib/phone';

/**
 * The 202 answer of POST /orders/{id}/pay (PaymentStartOut): the order plus `message` ("Check
 * your phone and enter your M-Pesa PIN.") and `prompt` (the masked phone the prompt went to).
 * @typedef {import('./orders').Order & { message: string, prompt: string }} PaymentStart
 */

/**
 * POST /api/v1/orders/{order_id}/pay (buyer): sends an M-Pesa STK prompt in the Safaricom
 * sandbox to the number the buyer entered for this payment. The amount always comes from the
 * server. This is the only place that builds the pay request: it sets the Idempotency-Key header
 * and always sends the JSON body `{phone_number}` with the number in its normalised 254 form
 * and no other field (the server accepts no body, but the app never sends one without a number).
 * Sending the same key with the same number again returns the current state with 202 and sends
 * no second prompt; the same key with another number gives 409 idempotency_key_reused.
 * Errors: 404; 409 order_not_payable, order_expiring (reason expired or too_close),
 * payment_in_progress, max_attempts_reached, idempotency_key_reused; 422 invalid_phone,
 * phone_required, idempotency_key_required, invalid_idempotency_key; 429
 * too_many_payment_attempts, too_many_buyer_payment_attempts, too_many_phone_numbers (with
 * Retry-After); 503 payments_unavailable; 502 payment_request_failed.
 * The number never appears in an error message or a log line.
 * @param {string} orderId
 * @param {string} idempotencyKey  from lib/payKey.js
 * @param {{ phoneNumber: string }} payment  the number as typed or normalised
 * @returns {Promise<PaymentStart>}
 */
export async function payOrder(orderId, idempotencyKey, { phoneNumber }) {
  if (!isValidIdempotencyKey(idempotencyKey)) {
    throw new TypeError('payOrder needs a valid idempotency key.');
  }
  const normalized = normalizePhone(phoneNumber);
  if (!normalized) throw new TypeError('payOrder needs a valid M-Pesa number.');
  const result = await unwrap(
    api.POST('/api/v1/orders/{order_id}/pay', {
      params: { path: { order_id: orderId }, header: { 'Idempotency-Key': idempotencyKey } },
      body: { phone_number: normalized },
    }),
  );
  return /** @type {PaymentStart} */ (/** @type {unknown} */ (result));
}
