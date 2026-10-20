/**
 * Decimal input and money arithmetic without floating point (F2b).
 *
 * Quantities and prices are typed as text, checked here, and sent to the API as normalised
 * strings ("82.5"). Products are computed on scaled BigInt values, never on JavaScript numbers.
 * Every amount computed here is a display estimate; the server's numbers are authoritative.
 */

/** Digits with an optional dot part; at least one digit overall ("5", "5.", ".5", "82.50"). */
const PLAIN_DECIMAL = /^(\d*)(?:\.(\d*))?$/;

export const DECIMAL_ERRORS = Object.freeze({
  empty: 'Enter a number.',
  comma: 'Use a dot for decimals, for example 82.50',
  notNumber: 'Enter a number using digits only, for example 82.50.',
  notPositive: 'Enter a number above 0.',
  negative: 'Enter 0 or more.',
  /** @param {number} n */
  tooManyDecimals: (n) => `Use at most ${n} decimal places.`,
  /** @param {number} max */
  tooLarge: (max) => `Enter ${new Intl.NumberFormat('en-KE').format(max)} or less.`,
});

/**
 * @typedef {{ ok: true, value: string } | { ok: false, error: string, code: string }} DecimalResult
 */

/**
 * Check a typed decimal and normalise it ("082.50" -> "82.5", "100.00" -> "100").
 * Rejects empty text, a comma, exponent notation, letters, NaN, a negative value, zero (unless
 * `allowZero`), more than `maxDecimals` decimals and values above `max`.
 * @param {string | null | undefined} text
 * @param {{ max: number, maxDecimals?: number, allowZero?: boolean }} options
 * @returns {DecimalResult}
 */
export function parseDecimalInput(text, { max, maxDecimals = 2, allowZero = false }) {
  const raw = (text ?? '').trim();
  const fail = (/** @type {string} */ code, /** @type {string} */ error) => ({
    ok: /** @type {const} */ (false),
    code,
    error,
  });
  if (raw === '') return fail('empty', DECIMAL_ERRORS.empty);
  if (raw.includes(',')) return fail('comma', DECIMAL_ERRORS.comma);
  if (raw.startsWith('-')) {
    return fail('negative', allowZero ? DECIMAL_ERRORS.negative : DECIMAL_ERRORS.notPositive);
  }
  const match = PLAIN_DECIMAL.exec(raw);
  if (!match || !/\d/.test(raw)) return fail('not_number', DECIMAL_ERRORS.notNumber);
  const [, intPart = '', fracPart = ''] = match;
  if (fracPart.length > maxDecimals) {
    return fail('too_many_decimals', DECIMAL_ERRORS.tooManyDecimals(maxDecimals));
  }
  const value = normalise(intPart, fracPart);
  const scaled = scale(intPart, fracPart, maxDecimals);
  if (scaled === 0n && !allowZero) return fail('zero', DECIMAL_ERRORS.notPositive);
  if (scaled > BigInt(max) * 10n ** BigInt(maxDecimals)) {
    return fail('too_large', DECIMAL_ERRORS.tooLarge(max));
  }
  return { ok: true, value };
}

/**
 * @param {string} intPart
 * @param {string} fracPart
 */
function normalise(intPart, fracPart) {
  const int = intPart.replace(/^0+(?=\d)/, '') || '0';
  const frac = fracPart.replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

/**
 * @param {string} intPart
 * @param {string} fracPart
 * @param {number} decimals
 */
function scale(intPart, fracPart, decimals) {
  return (
    BigInt(intPart || '0') * 10n ** BigInt(decimals) + BigInt(fracPart.padEnd(decimals, '0') || '0')
  );
}

/**
 * A non negative decimal (text with at most 2 decimals, or a number from the API) as integer
 * hundredths, or null when it is not one.
 * @param {string | number | null | undefined} value
 * @returns {bigint | null}
 */
export function toHundredths(value) {
  let text;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    // API numbers carry at most 2 decimals; toFixed only drops binary noise (40.1 -> "40.10").
    text = value.toFixed(2);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    return null;
  }
  const match = PLAIN_DECIMAL.exec(text);
  if (!match || !/\d/.test(text)) return null;
  const [, intPart = '', fracPart = ''] = match;
  if (fracPart.length > 2) return null;
  return scale(intPart, fracPart, 2);
}

/**
 * Integer hundredths as a 2 decimal string: 28140n -> "281.40".
 * @param {bigint} hundredths
 */
export function hundredthsToString(hundredths) {
  const int = hundredths / 100n;
  const frac = (hundredths % 100n).toString().padStart(2, '0');
  return `${int}.${frac}`;
}

/**
 * Whether two decimals are the same amount ("40.50" and 40.5 are).
 * @param {string | number | null | undefined} a
 * @param {string | number | null | undefined} b
 */
export function sameDecimal(a, b) {
  const x = toHundredths(a);
  const y = toHundredths(b);
  return x !== null && y !== null && x === y;
}

/**
 * Quantity times price, rounded half up to 2 decimals, for an estimate on screen only.
 * Both inputs are decimals with at most 2 decimals; returns "281.40", or null when either is
 * not a valid decimal.
 * @param {string | number | null | undefined} qtyText
 * @param {string | number | null | undefined} priceText
 * @returns {string | null}
 */
export function multiplyMoney(qtyText, priceText) {
  const qty = toHundredths(qtyText);
  const price = toHundredths(priceText);
  if (qty === null || price === null) return null;
  // qty and price are each scaled by 100, so the product is scaled by 10 000.
  const product = qty * price;
  return hundredthsToString((product + 50n) / 100n);
}

/**
 * A number from the API as the text an input starts with: 40 -> "40", 40.5 -> "40.5".
 * Returns "" for a value that is not a decimal with at most 2 places.
 * @param {number | string | null | undefined} value
 */
export function toDecimalText(value) {
  const hundredths = toHundredths(value ?? null);
  if (hundredths === null) return '';
  return hundredthsToString(hundredths).replace(/\.?0+$/, '');
}
