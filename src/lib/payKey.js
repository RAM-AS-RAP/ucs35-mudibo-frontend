/**
 * The Idempotency-Key of the buyer's current pay attempt, with the number it was used for
 * (identity v2, prompt 2; extends idempotency.js). The server replays a key only with the same
 * number (a different number gives 409 idempotency_key_reused), so:
 * - begin(phone) makes a new key for every attempt, except that it keeps the held key when the
 *   last result was unknown (markUncertain) and the normalised number is unchanged;
 * - markUncertain() after a network failure or a timeout;
 * - clear() after any answer from the server (202 or an error with a status).
 * One holder lives in a component ref; it is never stored, logged or put in a URL or query key.
 */
import { newIdempotencyKey } from './idempotency';
import { normalizePhone } from './phone';

/**
 * @typedef {object} PayKey
 * @property {string | null} key
 * @property {string | null} phone  the normalised number the key was made for
 * @property {boolean} uncertain
 * @property {(phone: string) => { key: string, phone: string }} begin
 * @property {() => void} markUncertain
 * @property {() => void} clear
 */

/**
 * @param {{ newKey?: () => string }} [options]
 * @returns {PayKey}
 */
export function createPayKey({ newKey = newIdempotencyKey } = {}) {
  /** @type {string | null} */
  let key = null;
  /** @type {string | null} */
  let phone = null;
  let uncertain = false;
  return {
    get key() {
      return key;
    },
    get phone() {
      return phone;
    },
    get uncertain() {
      return uncertain;
    },
    begin(raw) {
      const normalized = normalizePhone(raw);
      if (!normalized) throw new TypeError('A pay attempt needs a valid M-Pesa number.');
      if (!(uncertain && key && phone === normalized)) {
        key = newKey();
        phone = normalized;
        uncertain = false;
      }
      return { key: /** @type {string} */ (key), phone: normalized };
    },
    markUncertain() {
      if (key) uncertain = true;
    },
    clear() {
      key = null;
      phone = null;
      uncertain = false;
    },
  };
}
