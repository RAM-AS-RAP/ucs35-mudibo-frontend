/**
 * Display formatting for money, percentages and dates. Use these everywhere;
 * never format money or dates inline in a component.
 *
 * The server computes every price and total. These helpers only format values
 * for display; the client never recomputes a charged amount.
 */

export const TIME_ZONE = 'Africa/Nairobi';
const LOCALE = 'en-KE';
const PLACEHOLDER = '—';

const amountFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pctFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Format an amount in Kenyan shillings, for example `KES 1,234.50`.
 * @param {number | string | null | undefined} value a number or a numeric string from the API
 */
export function formatKES(value) {
  const n = toNumber(value);
  if (n === null) return PLACEHOLDER;
  return `KES ${amountFormat.format(n)}`;
}

const wholeFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

const unsignedPctFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Format a whole shilling amount without decimals, for example `KES 7,380` (a rounded bag price).
 * @param {number | string | null | undefined} value
 */
export function formatKESWhole(value) {
  const n = toNumber(value);
  if (n === null) return PLACEHOLDER;
  return `KES ${wholeFormat.format(n)}`;
}

/**
 * Format a KES amount with an explicit sign before the currency: `+KES 1.42`, `-KES 0.48`,
 * `KES 0.00`. Used for approximate effects, never for a charged amount.
 * @param {number | string | null | undefined} value
 */
export function formatSignedKES(value) {
  const n = toNumber(value);
  if (n === null) return PLACEHOLDER;
  const text = amountFormat.format(Math.abs(n));
  if (text === amountFormat.format(0)) return `KES ${text}`;
  return `${n > 0 ? '+' : '-'}KES ${text}`;
}

/**
 * Format a percentage without a sign, for example `6.2%` (inside "rise by about 6.2%").
 * @param {number | string | null | undefined} value
 */
export function formatPctUnsigned(value) {
  const n = toNumber(value);
  if (n === null) return PLACEHOLDER;
  return `${unsignedPctFormat.format(n)}%`;
}

const quantityFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });

/**
 * Format a quantity in kg without the unit: `1,200`, `120.5`.
 * @param {number | string | null | undefined} value
 */
export function formatQuantity(value) {
  const n = toNumber(value);
  if (n === null) return PLACEHOLDER;
  return quantityFormat.format(n);
}

/**
 * Format a byte count for a photo: `240 kB`, `1.4 MB`.
 * @param {number | null | undefined} bytes
 */
export function formatBytes(bytes) {
  const n = toNumber(bytes);
  if (n === null || n < 0) return PLACEHOLDER;
  if (n < 1000 * 1000) return `${Math.max(1, Math.round(n / 1000))} kB`;
  return `${(n / (1000 * 1000)).toFixed(1)} MB`;
}

/**
 * Format a percentage value (4.5 means 4.5%) with an explicit sign: `+4.5%`, `-2.0%`, `0.0%`.
 * @param {number | string | null | undefined} value
 */
export function formatPct(value) {
  const n = toNumber(value);
  if (n === null) return PLACEHOLDER;
  return `${pctFormat.format(n)}%`;
}

/**
 * Month and year, for example "August 2026".
 * Date only strings (YYYY-MM-DD or YYYY-MM) are calendar dates and are read in UTC so they
 * never shift to the previous month; full timestamps are shown in Nairobi time.
 * @param {string | null | undefined} isoDate
 */
export function formatMonth(isoDate) {
  if (!isoDate) return PLACEHOLDER;
  const dateOnly = /^\d{4}-\d{2}(-\d{2})?$/.test(isoDate);
  const date = new Date(dateOnly && isoDate.length === 7 ? `${isoDate}-01` : isoDate);
  if (Number.isNaN(date.getTime())) return PLACEHOLDER;
  return new Intl.DateTimeFormat(LOCALE, {
    month: 'long',
    year: 'numeric',
    timeZone: dateOnly ? 'UTC' : TIME_ZONE,
  }).format(date);
}

/**
 * Date and time in the Africa/Nairobi time zone, for example "15 Oct 2026, 14:05".
 * @param {string | null | undefined} iso an ISO 8601 timestamp (the API sends UTC)
 */
export function formatDateTime(iso) {
  if (!iso) return PLACEHOLDER;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return PLACEHOLDER;
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TIME_ZONE,
  }).format(date);
}

/**
 * Mask a phone number, keeping the first four and the last three digits:
 * `0712345678` becomes `0712***678`, `+254712345678` becomes `+2547*****678`.
 * @param {string | null | undefined} phone
 */
export function maskedPhone(phone) {
  if (!phone) return PLACEHOLDER;
  const trimmed = phone.replace(/[\s-]/g, '');
  const plus = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8) return plus + '*'.repeat(digits.length);
  return `${plus}${digits.slice(0, 4)}${'*'.repeat(digits.length - 7)}${digits.slice(-3)}`;
}
