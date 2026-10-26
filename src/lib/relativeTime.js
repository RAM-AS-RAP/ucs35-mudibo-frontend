/**
 * Relative time labels for the farmer price, trend and forecast screens.
 *
 * Farmers never see a calendar month, a year or a date on those screens. Time is counted in
 * whole months back from a series' latest published price, which the farmer sees as "now".
 * Backend month strings (YYYY-MM-DD) are only used to compute differences in months here.
 *
 * Month strings are parsed by splitting them into integers. Nothing in this file depends on the
 * device clock or its time zone, so a wrong device clock can never produce a wrong label.
 */

const ISO_MONTH = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

/**
 * `year * 12 + (month - 1)` for a `YYYY-MM-DD` (or `YYYY-MM`) string.
 * @param {string} iso
 * @returns {number}
 */
export function monthIndex(iso) {
  const match = typeof iso === 'string' ? ISO_MONTH.exec(iso) : null;
  const year = match ? Number.parseInt(match[1], 10) : NaN;
  const month = match ? Number.parseInt(match[2], 10) : NaN;
  if (!match || month < 1 || month > 12) {
    throw new Error(`Expected a YYYY-MM-DD month string, got ${JSON.stringify(iso)}`);
  }
  return year * 12 + (month - 1);
}

/**
 * The first day of the month with the given index, as `YYYY-MM-01`.
 * @param {number} index
 * @returns {string}
 */
export function monthFromIndex(index) {
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

/**
 * Whole months from `earlierIso` to `laterIso` (negative when "earlier" is later).
 * @param {string} laterIso
 * @param {string} earlierIso
 */
export function monthsBetween(laterIso, earlierIso) {
  return monthIndex(laterIso) - monthIndex(earlierIso);
}

/** @param {number} n */
const clamp = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** @param {number} n */
const monthsWord = (n) => (n === 1 ? '1 month' : `${n} months`);

/**
 * "Latest", "1 month ago", "N months ago". A negative value counts as 0.
 * @param {number} n
 */
export function agoLabel(n) {
  const months = clamp(n);
  return months === 0 ? 'Latest' : `${monthsWord(months)} ago`;
}

/**
 * "in 1 month", "in 2 months" (lower case, for use inside a sentence).
 * @param {number} n
 */
export function inLabel(n) {
  return `in ${monthsWord(clamp(n))}`;
}

/**
 * "In 1 month", "In 2 months".
 * @param {number} n
 */
export function inLabelCap(n) {
  return `In ${monthsWord(clamp(n))}`;
}

/**
 * "1 month older", "N months older": a market whose latest price is older than the newest one shown.
 * @param {number} n
 */
export function olderLabel(n) {
  return `${monthsWord(clamp(n))} older`;
}

/**
 * Chart axis tick: "Now" for the latest month, otherwise "N mo ago".
 * @param {number} n
 */
export function axisTick(n) {
  const months = clamp(n);
  return months === 0 ? 'Now' : `${months} mo ago`;
}

/** @type {Readonly<Record<string, number>>} */
const HORIZON_MONTHS = Object.freeze({ one_month: 1, two_month: 2 });

/**
 * Months ahead for a forecast horizon: 1 for `one_month`, 2 for `two_month`.
 * @param {string} horizon
 */
export function horizonMonths(horizon) {
  const months = HORIZON_MONTHS[horizon];
  if (!months) throw new Error(`Unknown forecast horizon ${JSON.stringify(horizon)}`);
  return months;
}

/**
 * The newest of the given month strings (the "now" of a view that shows several markets).
 * Empty or missing values are ignored; returns null when nothing is left.
 * @param {Array<string | null | undefined>} isos
 * @returns {string | null}
 */
export function referenceMonth(isos) {
  /** @type {string | null} */
  let best = null;
  let bestIndex = -Infinity;
  for (const iso of isos) {
    if (!iso) continue;
    const index = monthIndex(iso);
    if (index > bestIndex) {
      best = iso;
      bestIndex = index;
    }
  }
  return best;
}
