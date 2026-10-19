/**
 * Pure display logic of the forecast screens (unit tested in forecast.test.js).
 *
 * The server computes every price, change and contribution. The only values derived here are
 * display ones: the price of a 90 kg bag, the approximate KES per kg of each driver group and
 * the summary sentence. Wording rules: docs/forecast-display.md.
 */
import { FORECAST_TEXT, groupDescription } from './messages';
import { formatKES, formatKESWhole, formatPctUnsigned } from './format';
import { horizonMonths, inLabel, monthFromIndex, monthIndex } from './relativeTime';

/** Changes smaller than this (in percent, either way) count as "little change". */
export const NEUTRAL_THRESHOLD_PCT = 1;
/** Kilograms in the bag size farmers trade in. */
export const BAG_KG = 90;

/**
 * Price of a 90 kg bag, rounded to the nearest 10 KES (display only).
 * @param {number | null | undefined} pricePerKg
 * @returns {number | null}
 */
export function kgToBagPrice(pricePerKg) {
  if (typeof pricePerKg !== 'number' || !Number.isFinite(pricePerKg)) return null;
  return Math.round((pricePerKg * BAG_KG) / 10) * 10;
}

/**
 * "About KES 7,380 per 90 kg bag", or null when the price is missing.
 * @param {number | null | undefined} pricePerKg
 */
export function bagPriceText(pricePerKg) {
  const bag = kgToBagPrice(pricePerKg);
  return bag === null ? null : `About ${formatKESWhole(bag)} per ${BAG_KG} kg bag`;
}

/** @typedef {'rise' | 'fall' | 'flat'} Direction */

/**
 * `rise` from +1%, `fall` from -1%, otherwise (and for a missing value) `flat`.
 * @param {number | null | undefined} pct
 * @returns {Direction}
 */
export function directionOf(pct) {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return 'flat';
  if (pct >= NEUTRAL_THRESHOLD_PCT) return 'rise';
  if (pct <= -NEUTRAL_THRESHOLD_PCT) return 'fall';
  return 'flat';
}

/** The word shown with every direction (never colour alone). */
export const DIRECTION_WORDS = Object.freeze({
  rise: 'Increasing',
  fall: 'Falling',
  flat: 'Little change',
});

/** The word shown on an explanation bar, by the group's `direction`. */
export const EFFECT_WORDS = Object.freeze({
  increases: 'Boost',
  decreases: 'Drag',
  neutral: 'No effect',
});

/** @param {number} n */
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @typedef {object} ExplainabilityRow
 * @property {string} label
 * @property {string} description
 * @property {number} pct            the group's pct_contribution (percentage points)
 * @property {number} kesImpact      origin_price * pct / 100, rounded to 2 decimals (display only)
 * @property {'increases' | 'decreases' | 'neutral'} direction
 * @property {string} word           Boost, Drag or No effect
 * @property {number} barFraction    |pct| / the largest |pct| of the rows and the typical change
 */

/**
 * Rows for the driver groups, largest absolute log contribution first, plus the typical change.
 * Call only with an explanation that passed parseShap().
 * @param {import('./shapSchema').ShapValues} shap
 * @returns {{ rows: ExplainabilityRow[], typical: { label: string, description: string, pct: number, barFraction: number } }}
 */
export function explainabilityRows(shap) {
  const groups = [...shap.groups].sort(
    (a, b) => Math.abs(b.log_contribution) - Math.abs(a.log_contribution),
  );
  const typicalPct = shap.typical_change.pct_value;
  const largest = Math.max(
    Math.abs(typicalPct),
    ...groups.map((g) => Math.abs(g.pct_contribution)),
  );
  const fraction = (/** @type {number} */ pct) =>
    largest > 0 ? Math.min(1, Math.max(0, Math.abs(pct) / largest)) : 0;

  const rows = groups.map((group) => ({
    label: group.label,
    description: groupDescription(group.label),
    pct: group.pct_contribution,
    kesImpact: round2((shap.origin_price * group.pct_contribution) / 100),
    direction: group.direction,
    word: EFFECT_WORDS[group.direction],
    barFraction: fraction(group.pct_contribution),
  }));
  return {
    rows,
    typical: {
      label: shap.typical_change.label,
      description: FORECAST_TEXT.typicalDescription,
      pct: typicalPct,
      barFraction: fraction(typicalPct),
    },
  };
}

/**
 * The recommendation box: a tone, a title and a body. The decision always stays with the farmer.
 * The uncertainty line (FORECAST_TEXT.uncertainty) is shown separately, always.
 * @param {number} expectedChangePct
 * @param {string} horizon  one_month or two_month
 * @returns {{ tone: Direction, title: string, body: string }}
 */
export function recommendationFor(expectedChangePct, horizon) {
  const tone = directionOf(expectedChangePct);
  const when = inLabel(horizonMonths(horizon));
  const size = formatPctUnsigned(Math.abs(expectedChangePct));
  if (tone === 'rise') {
    return {
      tone,
      title: 'The model expects the price to rise',
      body: `The forecast is for the price to rise by about ${size} ${when}. Waiting may give a better price, but only if you can keep your produce safely and do not need the money sooner. The decision is yours.`,
    };
  }
  if (tone === 'fall') {
    return {
      tone,
      title: 'The model expects the price to fall',
      body: `The forecast is for the price to fall by about ${size} ${when}. Selling sooner may protect your income, if you have a buyer. The decision is yours.`,
    };
  }
  return {
    tone,
    title: 'The model expects little change',
    body: 'Choose when to sell based on your own needs and the offers you receive.',
  };
}

/** @param {string} text */
const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);
/** @param {string} text */
const upperFirst = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** @param {ExplainabilityRow} row */
function rowPhrase(row) {
  const amount = formatKES(Math.abs(row.kesImpact));
  const label = lowerFirst(row.label);
  if (row.direction === 'increases') return `${label} adds about ${amount}`;
  if (row.direction === 'decreases') return `${label} takes away about ${amount}`;
  return `${label} has little effect`;
}

/** @param {string[]} parts */
function joinList(parts) {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/**
 * One plain sentence describing the forecast and its explanation, for screen readers and as the
 * text alternative of the explanation bars.
 * @param {{ horizon: string, predicted_price: number, origin_price: number, expected_change_pct: number }} forecast
 * @param {ExplainabilityRow[]} rows
 */
export function summaryText(forecast, rows) {
  const months = horizonMonths(forecast.horizon);
  const ahead = months === 1 ? '1 month ahead' : `${months} months ahead`;
  const pct = forecast.expected_change_pct;
  const pctText = formatPctUnsigned(Math.abs(pct));
  const origin = formatKES(forecast.origin_price);
  const change =
    pctText === '0.0%'
      ? `about the same as the latest price of ${origin}`
      : `${pct > 0 ? 'up' : 'down'} ${pctText} from the latest price of ${origin}`;
  const head = `Forecast for ${ahead}: ${formatKES(forecast.predicted_price)} per kg, ${change}.`;
  if (rows.length === 0) return head;
  return `${head} ${upperFirst(joinList(rows.map(rowPhrase)))}.`;
}

/**
 * Every calendar month from `firstMonth` to `lastMonth` as `YYYY-MM-01`, with the price of that
 * month or null when the data has none. Missing months stay null: never interpolate.
 * @param {Array<{ month: string, avg_price_per_kg: number }>} points
 * @param {string | null} firstMonth
 * @param {string | null} lastMonth
 * @returns {Array<{ month: string, price: number | null }>}
 */
export function buildMonthAxis(points, firstMonth, lastMonth) {
  if (!firstMonth || !lastMonth) return [];
  const start = monthIndex(firstMonth);
  const end = monthIndex(lastMonth);
  /** @type {Map<number, number>} */
  const byIndex = new Map();
  for (const point of points) {
    const price = point.avg_price_per_kg;
    if (typeof price === 'number' && Number.isFinite(price)) {
      byIndex.set(monthIndex(point.month), price);
    }
  }
  const axis = [];
  for (let i = start; i <= end; i += 1) {
    axis.push({ month: monthFromIndex(i), price: byIndex.get(i) ?? null });
  }
  return axis;
}
