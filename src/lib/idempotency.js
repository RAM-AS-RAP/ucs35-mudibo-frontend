/**
 * Idempotency keys for POST /orders/{id}/pay (F3). One key per deliberate payment attempt:
 * the same key is sent again only after a network failure or a timeout (the server replays the
 * first answer and sends no second prompt). Keys live in a component ref only: never in
 * storage, a URL, a query key or a log line.
 */

/** 8 to 64 letters, digits, "-" and "_" (the backend's rule). */
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Whether a value is an acceptable Idempotency-Key.
 * @param {unknown} key
 */
export function isValidIdempotencyKey(key) {
  return typeof key === 'string' && KEY_PATTERN.test(key);
}

/**
 * A new random key: a UUID from crypto.randomUUID, or 32 hex characters from
 * crypto.getRandomValues where randomUUID is missing (older browsers, non secure contexts).
 * @param {{ crypto?: Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string } }} [options]
 * @returns {string}
 */
export function newIdempotencyKey({ crypto: source = globalThis.crypto } = {}) {
  if (typeof source?.randomUUID === 'function') return source.randomUUID();
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
