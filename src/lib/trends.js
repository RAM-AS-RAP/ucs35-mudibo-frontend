/**
 * Pure logic of the price trend chart and its data table (unit tested in trends.test.js).
 *
 * Every point is placed by `n`, the number of months before the reference month (the newest
 * latest month among the markets shown), so "Now" is on the right and older months to the left.
 * A market whose latest price is older sits that many months back. Missing months stay gaps.
 */
import { buildMonthAxis } from './forecast';
import { formatKES } from './format';
import { cropLabel } from './messages';
import { agoLabel, axisTick, monthsBetween, referenceMonth } from './relativeTime';

/** Every third tick has a label, counted from "Now". */
export const TICK_EVERY = 3;

/**
 * @typedef {{ market: string, crop: string, points: Array<{ month: string, avg_price_per_kg: number }>, first_month: string | null, last_month: string | null }} Trend
 * @typedef {{ n: number, values: Record<string, number | null> }} TrendRow
 */

/**
 * Combine the trends of several markets on one relative month axis.
 * @param {Trend[]} trends
 * @returns {{ rows: TrendRow[], markets: string[], lag: Record<string, number>, points: Record<string, number> }}
 *   rows oldest first (largest n first); lag: months a market's latest price is behind the newest;
 *   points: number of prices per market
 */
export function buildTrendRows(trends) {
  const withData = trends.filter((t) => t.first_month && t.last_month && t.points.length > 0);
  const reference = referenceMonth(withData.map((t) => t.last_month));
  const markets = withData.map((t) => t.market);
  if (!reference) return { rows: [], markets: [], lag: {}, points: {} };

  /** @type {Map<number, Record<string, number | null>>} */
  const byN = new Map();
  /** @type {Record<string, number>} */
  const lag = {};
  /** @type {Record<string, number>} */
  const points = {};
  let oldest = 0;
  for (const trend of withData) {
    const axis = buildMonthAxis(trend.points, trend.first_month, trend.last_month);
    lag[trend.market] = monthsBetween(reference, /** @type {string} */ (trend.last_month));
    points[trend.market] = axis.filter((a) => a.price !== null).length;
    for (const { month, price } of axis) {
      const n = monthsBetween(reference, month);
      oldest = Math.max(oldest, n);
      const values = byN.get(n) ?? {};
      values[trend.market] = price;
      byN.set(n, values);
    }
  }

  /** @type {TrendRow[]} */
  const rows = [];
  for (let n = oldest; n >= 0; n -= 1) {
    const found = byN.get(n) ?? {};
    /** @type {Record<string, number | null>} */
    const values = {};
    for (const market of markets) values[market] = found[market] ?? null;
    rows.push({ n, values });
  }
  return { rows, markets, lag, points };
}

/**
 * For the latest price cards: how many months each market's latest price is behind the newest one
 * shown (0 for the newest). A month string that cannot be read counts as 0.
 * @param {Array<{ market: unknown, month: unknown }>} items
 * @returns {Record<string, number>}
 */
export function monthsOlderByMarket(items) {
  const months = items.map((item) => (typeof item.month === 'string' ? item.month : null));
  let reference = null;
  try {
    reference = referenceMonth(months);
  } catch {
    reference = null;
  }
  /** @type {Record<string, number>} */
  const result = {};
  items.forEach((item, i) => {
    const month = months[i];
    let lag = 0;
    if (reference && month) {
      try {
        lag = Math.max(0, monthsBetween(reference, month));
      } catch {
        lag = 0;
      }
    }
    result[String(item.market)] = lag;
  });
  return result;
}

/** Rows in the shape Recharts expects: `{ n, [market]: price | null }`. @param {TrendRow[]} rows */
export function toChartData(rows) {
  return rows.map(({ n, values }) => ({ n, ...values }));
}

/** Number of months that have at least one price. @param {TrendRow[]} rows */
export function plottedMonthCount(rows) {
  return rows.filter((row) => Object.values(row.values).some((v) => v !== null)).length;
}

/**
 * The x axis tick label: "Now", "3 mo ago", ... on every third month only, empty otherwise.
 * @param {number} n
 */
export function tickFormatter(n) {
  return n % TICK_EVERY === 0 ? axisTick(n) : '';
}

/**
 * The tooltip line of one market at one month: "3 months ago: KES 82.00".
 * @param {number} n
 * @param {number | null | undefined} price
 */
export function tooltipLine(n, price) {
  return `${agoLabel(n)}: ${price === null || price === undefined ? 'No price' : formatKES(price)}`;
}

/** The y axis tick: whole shillings with the currency. @param {number} value */
export function priceTickFormatter(value) {
  return formatKES(value).replace(/\.00$/, '');
}

/** ", 6 months ago" for an older month, nothing for the reference month. @param {number} n */
const whenSuffix = (n) => (n === 0 ? '' : `, ${agoLabel(n)}`);

/**
 * The text alternative of the chart, one sentence group per market, relative months only:
 * "Maize in Nairobi, 14 months of prices. Latest KES 82.00. Lowest KES 74.00, 6 months ago.
 * Highest KES 90.00, 2 months ago."
 * @param {TrendRow[]} rows
 * @param {string[]} markets
 * @param {string} crop
 */
export function trendSummary(rows, markets, crop) {
  const name = cropLabel(crop);
  return markets
    .map((market) => {
      const series = rows
        .map((row) => ({ n: row.n, price: row.values[market] }))
        .filter((p) => p.price !== null && p.price !== undefined);
      if (series.length === 0) return `${name} in ${market}: no prices.`;
      // Rows are oldest first; the latest point is the last one.
      const latest = series[series.length - 1];
      let low = latest;
      let high = latest;
      // Newest first with strict comparisons, so a tie keeps the most recent month.
      for (const point of [...series].reverse()) {
        if (/** @type {number} */ (point.price) < /** @type {number} */ (low.price)) low = point;
        if (/** @type {number} */ (point.price) > /** @type {number} */ (high.price)) high = point;
      }
      const count = series.length === 1 ? '1 month of prices' : `${series.length} months of prices`;
      return [
        `${name} in ${market}, ${count}.`,
        `Latest ${formatKES(latest.price)}${whenSuffix(latest.n)}.`,
        `Lowest ${formatKES(low.price)}${whenSuffix(low.n)}.`,
        `Highest ${formatKES(high.price)}${whenSuffix(high.n)}.`,
      ].join(' ');
    })
    .join(' ');
}
