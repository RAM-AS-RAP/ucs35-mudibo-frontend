/**
 * Asking price sanity check (F2b). A common slip is typing the price of a 90 kg bag where the
 * form asks for the price of 1 kg. The check compares the asking price with the latest market
 * price and asks the farmer to look again; it never blocks a price outright.
 *
 * The ratio is compared with integer arithmetic so the edges are exact.
 */
import { toHundredths } from './decimal';

/**
 * Thresholds as fractions [numerator, denominator] of the latest price, in one place.
 * ok: 0.7 to 1.4 (inclusive). caution: 0.5 to 0.7, or 1.4 to 2 (inclusive). confirm: outside.
 */
export const PRICE_CHECK_THRESHOLDS = Object.freeze({
  okLow: /** @type {const} */ ([7n, 10n]),
  okHigh: /** @type {const} */ ([14n, 10n]),
  cautionLow: /** @type {const} */ ([5n, 10n]),
  cautionHigh: /** @type {const} */ ([2n, 1n]),
});

/**
 * @typedef {{ level: 'ok' | 'caution' | 'confirm', ratio: number | null }} PriceCheck
 */

/**
 * @param {string | null | undefined} askingText  the typed asking price per kg
 * @param {number | null | undefined} latestPricePerKg  the latest market price per kg, if known
 * @returns {PriceCheck}
 */
export function checkAskingPrice(askingText, latestPricePerKg) {
  const asking = toHundredths(askingText ?? '');
  const latest = toHundredths(latestPricePerKg ?? null);
  if (asking === null || latest === null || latest === 0n || asking === 0n) {
    return { level: 'ok', ratio: null };
  }
  // asking / latest compared with n / d as asking * d against latest * n.
  const atLeast = (/** @type {readonly [bigint, bigint]} */ [n, d]) => asking * d >= latest * n;
  const atMost = (/** @type {readonly [bigint, bigint]} */ [n, d]) => asking * d <= latest * n;
  const t = PRICE_CHECK_THRESHOLDS;
  // The ratio to 4 decimals, for wording only ("about 60% above").
  const ratio = Number((asking * 10_000n) / latest) / 10_000;
  if (atLeast(t.okLow) && atMost(t.okHigh)) return { level: 'ok', ratio };
  if (atLeast(t.cautionLow) && atMost(t.cautionHigh)) return { level: 'caution', ratio };
  return { level: 'confirm', ratio };
}

/**
 * How the asking price compares, in words: "about 60% above", "about 40% below",
 * "about 3 times".
 * @param {number} ratio
 */
export function comparisonWords(ratio) {
  if (ratio >= 2) {
    const times = Math.round(ratio * 10) / 10;
    return `about ${Number.isInteger(times) ? times : times.toFixed(1)} times`;
  }
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  return `about ${pct}% ${ratio >= 1 ? 'above' : 'below'}`;
}
