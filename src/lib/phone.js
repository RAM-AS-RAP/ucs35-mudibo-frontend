/**
 * The M-Pesa number of a payment (identity v2, prompt 2). The number is personal data: it lives
 * only in the order screen's component state and is never stored, logged, or put in a URL,
 * router state or query key. The server normalises it again and is the authority.
 */
const KENYAN_MOBILE = /^254[17]\d{8}$/;

/**
 * Normalise a Kenyan mobile number the way the server does (the F1 normaliser, moved here from
 * validation.js when phone numbers left the accounts): strip spaces and dashes, accept
 * 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX (and the 2541 forms).
 * @param {unknown} raw
 * @returns {string | null}  254XXXXXXXXX, or null when the number is not accepted
 */
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let value = raw.replace(/[\s-]/g, '');
  if (value.startsWith('+')) value = value.slice(1);
  if (value.startsWith('0') && value.length === 10) value = `254${value.slice(1)}`;
  return KENYAN_MOBILE.test(value) ? value : null;
}

export const PHONE_FIELD_TEXT = Object.freeze({
  empty: 'Enter the M-Pesa number to send the payment prompt to.',
  invalid: 'Enter a valid Safaricom number, for example 0712 345 678.',
});

const NORMALIZED = /^254([17]\d{2})(\d{3})(\d{3})$/;

/**
 * A normalised number in the local form people read: 254712345678 gives "0712 345 678"
 * (also for 2541…). Anything else gives null.
 * @param {unknown} normalized
 * @returns {string | null}
 */
export function formatPhoneLocal(normalized) {
  if (typeof normalized !== 'string') return null;
  const match = NORMALIZED.exec(normalized);
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : null;
}

/**
 * The field's error for what the buyer typed, or null when the server would accept it.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function phoneFieldError(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return PHONE_FIELD_TEXT.empty;
  return normalizePhone(value) ? null : PHONE_FIELD_TEXT.invalid;
}
