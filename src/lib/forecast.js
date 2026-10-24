/**
 * Pure display logic of the forecast screens (unit tested in forecast.test.js).
 *
 * The server computes every price, change and contribution. The only values derived here are
 * display ones: the price of a 90 kg bag, the KES per kg of each step of the explanation chart
 * and the summary sentence. Wording rules: docs/forecast-display.md.
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

/** The chart scale always covers at least this share of the latest price, so a tiny change does not fill it. */
export const MIN_AXIS_SHARE = 0.05;
/** Room on each side of the steps, as a share of the scale. */
const AXIS_PADDING = 0.06;
/**
 * The amounts are shared out only when the explanation's total log change and the headline's
 * agree within this factor; otherwise each part keeps its own approximate amount.
 */
const SHARE_RATIO = Object.freeze({ min: 0.8, max: 1.25 });

/**
 * @typedef {object} ExplainabilityStep
 * @property {string} id
 * @property {'typical' | 'group'} kind
 * @property {string} label
 * @property {string} description
 * @property {number} pct    the backend's percentage points (pct_contribution or pct_value)
 * @property {boolean} up    pushed the forecast up (true) or pulled it down (false); never neutral
 * @property {number} kes    signed KES per kg, whole cents (display only)
 * @property {number} from   price before this step (display only)
 * @property {number} to     price after this step (display only)
 */

/**
 * @typedef {object} ExplainabilityChart
 * @property {number} start   the latest price (origin_price)
 * @property {number} end     the forecast price (predicted_price)
 * @property {boolean} shared true when the steps were shared out so they land exactly on `end`
 * @property {ExplainabilityStep[]} steps
 * @property {{ min: number, max: number, ticks: number[] }} axis
 */

/**
 * Up or down from the sign of the log contribution, then of the percentage, then the backend's
 * direction. There is no neutral: even a tiny part has a sign.
 * @param {number} log
 * @param {number} pct
 * @param {string} [direction]
 */
function isUp(log, pct, direction) {
  if (log !== 0) return log > 0;
  if (pct !== 0) return pct > 0;
  return direction !== 'decreases';
}

/** @param {number} n */
const toCents = (n) => Math.round(n * 100);

/**
 * Splits `totalCents` in proportion to `weights` into whole cents that add up exactly
 * (largest remainder). Only call with a non zero weight sum.
 * @param {number[]} weights
 * @param {number} totalCents
 */
function shareOutCents(weights, totalCents) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (totalCents * w) / sum);
  const cents = exact.map(Math.floor);
  let left = totalCents - cents.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, i) => ({ i, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    cents[i] += 1;
    left -= 1;
  }
  return cents;
}

/**
 * A rounded step for tick marks: 1, 2, 2.5 or 5 times a power of ten, a few per scale.
 * @param {number} range
 */
function tickStep(range) {
  const rough = range / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const factor = [1, 2, 2.5, 5, 10].find((f) => f * magnitude >= rough) ?? 10;
  return factor * magnitude;
}

/**
 * The scale of the chart: zoomed to the prices the steps pass through, at least
 * MIN_AXIS_SHARE of the latest price wide, with a little room on each side.
 * @param {number[]} values
 * @param {number} start
 */
function axisFor(values, start) {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const minSpan = Math.max(Math.abs(start) * MIN_AXIS_SHARE, 0.1);
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = (hi - lo) * AXIS_PADDING;
  const min = Math.min(...values) >= 0 ? Math.max(0, lo - pad) : lo - pad;
  const max = hi + pad;
  const step = tickStep(max - min);
  const ticks = [];
  for (let k = Math.ceil(min / step); k * step <= max; k += 1) {
    ticks.push(Number((k * step).toFixed(6)));
  }
  return { min, max, ticks };
}

/**
 * The price staircase: from the latest price, one step for the typical change and one per driver
 * group (largest absolute log contribution first), to the forecast price.
 *
 * The model's parts add up in log terms, so when the explanation agrees with the headline the
 * KES change (forecast minus latest price, both from the server) is shared out between the parts
 * in proportion to their log contributions, in whole cents, and the steps land exactly on the
 * forecast. Otherwise each part keeps its own approximate amount (latest price times its
 * percentage). Display only; call only with an explanation that passed parseShap().
 * @param {import('./shapSchema').ShapValues} shap
 * @returns {ExplainabilityChart}
 */
export function explainabilityChart(shap) {
  const start = shap.origin_price;
  const end = shap.predicted_price;
  const groups = [...shap.groups].sort(
    (a, b) => Math.abs(b.log_contribution) - Math.abs(a.log_contribution),
  );
  const parts = [
    {
      id: 'typical',
      kind: /** @type {const} */ ('typical'),
      label: shap.typical_change.label,
      description: FORECAST_TEXT.typicalDescription,
      log: shap.typical_change.log_value,
      pct: shap.typical_change.pct_value,
      up: isUp(shap.typical_change.log_value, shap.typical_change.pct_value),
    },
    ...groups.map((group) => ({
      id: group.label,
      kind: /** @type {const} */ ('group'),
      label: group.label,
      description: groupDescription(group.label),
      log: group.log_contribution,
      pct: group.pct_contribution,
      up: isUp(group.log_contribution, group.pct_contribution, group.direction),
    })),
  ];

  const logSum = parts.reduce((total, part) => total + part.log, 0);
  const ratio = start > 0 && end > 0 && logSum !== 0 ? Math.log(end / start) / logSum : NaN;
  const shared = ratio >= SHARE_RATIO.min && ratio <= SHARE_RATIO.max;
  const cents = shared
    ? shareOutCents(
        parts.map((part) => part.log),
        toCents(end) - toCents(start),
      )
    : parts.map((part) => toCents((start * part.pct) / 100));

  let current = toCents(start);
  const steps = parts.map((part, i) => {
    const from = current / 100;
    current += cents[i];
    return {
      id: part.id,
      kind: part.kind,
      label: part.label,
      description: part.description,
      pct: part.pct,
      up: part.up,
      kes: cents[i] / 100,
      from,
      to: current / 100,
    };
  });

  const values = [start, end, ...steps.map((step) => step.to)];
  return { start, end, shared, steps, axis: axisFor(values, start) };
}

/**
 * Where a price sits on the chart scale, from 0 to 100 (percent of the track width).
 * @param {{ min: number, max: number }} axis
 * @param {number} value
 */
export function axisPercent(axis, value) {
  const range = axis.max - axis.min;
  if (!(range > 0)) return 50;
  return Math.min(100, Math.max(0, ((value - axis.min) / range) * 100));
}

/**
 * "+KES 1.45" or "-KES 0.50": always signed by the step's direction, even when it rounds to 0.00.
 * @param {{ up: boolean, kes: number }} step
 */
export function stepAmountText(step) {
  return `${step.up ? '+' : '-'}${formatKES(Math.abs(step.kes))}`;
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

/** @param {ExplainabilityStep} step */
function stepPhrase(step) {
  const amount = formatKES(Math.abs(step.kes));
  const label = lowerFirst(step.label);
  return step.up ? `${label} adds about ${amount}` : `${label} takes away about ${amount}`;
}

/** @param {string[]} parts */
function joinList(parts) {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/**
 * One plain sentence describing the forecast and its explanation, for screen readers and as the
 * text alternative of the explanation chart. Names the driver groups, not the typical change.
 * @param {{ horizon: string, predicted_price: number, origin_price: number, expected_change_pct: number }} forecast
 * @param {ExplainabilityStep[]} steps
 */
export function summaryText(forecast, steps) {
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
  const groups = steps.filter((step) => step.kind === 'group');
  if (groups.length === 0) return head;
  return `${head} ${upperFirst(joinList(groups.map(stepPhrase)))}.`;
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
