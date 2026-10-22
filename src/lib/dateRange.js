/**
 * The payments date filter (F4): `created_from` and `created_to` as calendar dates
 * (YYYY-MM-DD, the `date` format of openapi.json). Both are optional; when both are given the
 * start may not be after the end. An invalid range sends no request.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const DATE_RANGE_TEXT = Object.freeze({
  invalidFrom: 'Enter the start date as a full date, for example 2026-10-01.',
  invalidTo: 'Enter the end date as a full date, for example 2026-10-31.',
  reversed: 'The start date must not be after the end date.',
});

/**
 * Whether a string is a real calendar date written as YYYY-MM-DD.
 * @param {unknown} value
 */
export function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * @typedef {{ ok: true, from: string | null, to: string | null }
 *   | { ok: false, field: 'from' | 'to', error: string }} DateRangeResult
 */

/**
 * Validate the date filter. Empty values mean "no limit".
 * @param {{ from?: string | null, to?: string | null }} range
 * @returns {DateRangeResult}
 */
export function validateDateRange({ from, to }) {
  const start = from ? from.trim() : '';
  const end = to ? to.trim() : '';
  if (start && !isIsoDate(start))
    return { ok: false, field: 'from', error: DATE_RANGE_TEXT.invalidFrom };
  if (end && !isIsoDate(end)) return { ok: false, field: 'to', error: DATE_RANGE_TEXT.invalidTo };
  // ISO dates of the same shape compare correctly as strings.
  if (start && end && start > end)
    return { ok: false, field: 'from', error: DATE_RANGE_TEXT.reversed };
  return { ok: true, from: start || null, to: end || null };
}
