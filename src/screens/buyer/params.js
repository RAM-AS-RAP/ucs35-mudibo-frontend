/**
 * Selections of the buyer browse screen, held in the URL query string (F3). Only non sensitive
 * values are stored, each validated: an invalid value is removed so the default applies.
 */
import { parseDecimalInput, toHundredths } from '@/lib/decimal';
import { PRICE_FILTER_MAX } from '@/lib/constants';
import { pickValue } from '@/lib/filterParams';
import { cropLabel } from '@/lib/messages';

export const BROWSE_CROPS = /** @type {const} */ (['all', 'maize', 'beans']);
export const BROWSE_CROP_OPTIONS = BROWSE_CROPS.map((value) => ({
  value,
  label: value === 'all' ? 'All' : cropLabel(value),
}));

export const SORTS = /** @type {const} */ (['newest', 'price_asc', 'price_desc']);
export const DEFAULT_SORT = 'newest';
export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

/**
 * A price filter text: null for empty, the normalised decimal when valid, or an error.
 * @param {string | null | undefined} text
 * @returns {{ ok: true, value: string | null } | { ok: false, error: string }}
 */
export function parsePriceFilter(text) {
  if (!text || text.trim() === '') return { ok: true, value: null };
  const parsed = parseDecimalInput(text, { max: PRICE_FILTER_MAX, allowZero: true });
  return parsed.ok ? { ok: true, value: parsed.value } : { ok: false, error: parsed.error };
}

/**
 * Whether a minimum price is above a maximum price (both valid decimals or null).
 * @param {string | null} min
 * @param {string | null} max
 */
export function minAboveMax(min, max) {
  if (min === null || max === null) return false;
  return /** @type {bigint} */ (toHundredths(min)) > /** @type {bigint} */ (toHundredths(max));
}

/** Longest market name kept from the URL before the market list has loaded. */
export const MARKET_PARAM_MAX = 100;

/**
 * The market from the URL. With the list from GET /listings/markets, only a name on it is kept;
 * before the list has loaded (or when it failed), any short non empty name is kept and the
 * server validates it.
 * @param {string | null} marketParam
 * @param {readonly string[] | null} marketNames
 */
export function pickMarket(marketParam, marketNames) {
  if (!marketParam || marketParam.length > MARKET_PARAM_MAX) return null;
  if (marketNames === null) return marketParam;
  return marketNames.includes(marketParam) ? marketParam : null;
}

/**
 * The browse filters from the URL. Invalid values fall back to the defaults; prices that are
 * invalid, or a minimum above the maximum, are dropped.
 * @param {URLSearchParams} params
 * @param {readonly string[] | null} [marketNames]  the buyer markets, or null while unknown
 */
export function readBrowseParams(params, marketNames = null) {
  const crop = pickValue(params.get('crop'), BROWSE_CROPS, 'all');
  const market = pickMarket(params.get('market'), marketNames);
  const sort = pickValue(params.get('sort'), SORTS, DEFAULT_SORT);
  const minParsed = parsePriceFilter(params.get('min'));
  const maxParsed = parsePriceFilter(params.get('max'));
  let minPrice = minParsed.ok ? minParsed.value : null;
  let maxPrice = maxParsed.ok ? maxParsed.value : null;
  if (minAboveMax(minPrice, maxPrice)) {
    minPrice = null;
    maxPrice = null;
  }
  return {
    crop: crop === 'all' ? null : /** @type {'maize' | 'beans'} */ (crop),
    market,
    minPrice,
    maxPrice,
    sort: /** @type {(typeof SORTS)[number]} */ (sort),
  };
}

/**
 * The query string holding exactly these filters (defaults are left out).
 * @param {ReturnType<typeof readBrowseParams>} filters
 */
export function writeBrowseParams({ crop, market, minPrice, maxPrice, sort }) {
  const next = new URLSearchParams();
  if (crop) next.set('crop', crop);
  if (market) next.set('market', market);
  if (minPrice !== null) next.set('min', minPrice);
  if (maxPrice !== null) next.set('max', maxPrice);
  if (sort !== DEFAULT_SORT) next.set('sort', sort);
  return next;
}
