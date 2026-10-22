/**
 * Formatting for the forecast accuracy screen (F4). Values are shown as the server computed
 * them; these helpers only turn them into text and never return "NaN", "null" or "undefined".
 *
 * Units: openapi.json gives the accuracy fields no type or description. The frontend reads
 * them as follows (one place to change if the backend documents otherwise):
 * - `mape` and `pct_error` are percentages (4.5 means 4.5%), as their names say;
 * - `directional_accuracy` and `beat_persistence_rate` are shares between 0 and 1 (0.62 means
 *   62%).
 */

export const NOT_ENOUGH_DATA = 'Not enough data';

/**
 * A finite number from a number or numeric string, or null.
 * @param {unknown} value
 * @returns {number | null}
 */
function finite(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const oneDecimal = new Intl.NumberFormat('en-KE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * A percentage value (4.5 means 4.5%): "4.5%", or "Not enough data" when missing.
 * @param {unknown} value
 */
export function formatPctValue(value) {
  const n = finite(value);
  return n === null ? NOT_ENOUGH_DATA : `${oneDecimal.format(n)}%`;
}

/**
 * A share between 0 and 1 as a percentage: 0.625 is "62.5%", or "Not enough data".
 * @param {unknown} value
 */
export function formatRate(value) {
  const n = finite(value);
  return n === null ? NOT_ENOUGH_DATA : `${oneDecimal.format(n * 100)}%`;
}

/**
 * A count, or "Not enough data" when missing.
 * @param {unknown} value
 */
export function formatCount(value) {
  const n = finite(value);
  return n === null ? NOT_ENOUGH_DATA : String(Math.round(n));
}

/** @type {Readonly<Record<string, string>>} */
const HORIZONS = Object.freeze({ one_month: '1 month', two_month: '2 months' });

/**
 * "1 month" or "2 months" for a ForecastHorizon value; anything else as readable text.
 * @param {unknown} horizon
 */
export function horizonLabel(horizon) {
  if (typeof horizon !== 'string' || horizon === '') return 'Unknown horizon';
  return HORIZONS[horizon] ?? horizon.replace(/_/g, ' ');
}
