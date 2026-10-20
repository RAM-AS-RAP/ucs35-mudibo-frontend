/**
 * Selections of the farmer screens, held in the URL query string. Only non sensitive values
 * (crop, market, horizon, range) are stored, each validated against its allowed values or the
 * markets list; an invalid value falls back to the default.
 */
import { cropLabel } from '@/lib/messages';

export const CROPS = /** @type {const} */ (['maize', 'beans']);
export const HORIZONS = /** @type {const} */ (['one_month', 'two_month']);
export const RANGES = /** @type {const} */ ([12, 24, 60]);

export const DEFAULT_CROP = 'maize';
export const DEFAULT_HORIZON = 'one_month';
export const DEFAULT_RANGE = 24;

export const CROP_OPTIONS = CROPS.map((value) => ({ value, label: cropLabel(value) }));
export const HORIZON_OPTIONS = [
  { value: /** @type {const} */ ('one_month'), label: '1 month' },
  { value: /** @type {const} */ ('two_month'), label: '2 months' },
];
export const RANGE_OPTIONS = [
  { value: '12', label: '12 months' },
  { value: '24', label: '24 months' },
  { value: '60', label: 'All (up to 60)' },
];

// Shared with the buyer screens (lib/filterParams.js); re-exported for the farmer screens.
export {
  cleanFilterParams,
  isUuid,
  NOT_PAID_STATUSES,
  ORDER_FILTER_OPTIONS,
  ORDER_FILTERS,
  pickValue,
} from '@/lib/filterParams';

/**
 * @param {string | null} value
 * @returns {12 | 24 | 60}
 */
export function pickRange(value) {
  const n = Number(value);
  return /** @type {12 | 24 | 60} */ (
    RANGES.includes(/** @type {12 | 24 | 60} */ (n)) ? n : DEFAULT_RANGE
  );
}

/**
 * The markets from a comma separated parameter that exist in `available`, in the order of
 * `available`; all of them when none is valid or the parameter is missing.
 * @param {string | null} value
 * @param {string[]} available
 */
export function pickMarkets(value, available) {
  const wanted = new Set((value ?? '').split(',').filter(Boolean));
  const valid = available.filter((market) => wanted.has(market));
  return valid.length > 0 ? valid : available;
}

/**
 * The query string with every invalid value removed, so the defaults apply. Returns null when
 * nothing needs to change. Markets are checked only once the list is known.
 * @param {URLSearchParams} params
 * @param {{ crop?: boolean, horizon?: boolean, range?: boolean, market?: string[] | null, markets?: string[] | null }} rules
 */
export function cleanParams(params, rules) {
  const next = new URLSearchParams(params);
  const drop = (/** @type {string} */ key, /** @type {(v: string) => boolean} */ isValid) => {
    const value = next.get(key);
    if (value !== null && !isValid(value)) next.delete(key);
  };
  if (rules.crop) drop('crop', (v) => CROPS.includes(/** @type {any} */ (v)));
  if (rules.horizon) drop('horizon', (v) => HORIZONS.includes(/** @type {any} */ (v)));
  if (rules.range) drop('range', (v) => RANGES.includes(/** @type {any} */ (Number(v))));
  if (rules.market) {
    const available = rules.market;
    drop('market', (v) => available.includes(v));
  }
  if (rules.markets) {
    const available = rules.markets;
    const value = next.get('markets');
    if (value !== null) {
      const valid = value.split(',').filter((m) => available.includes(m));
      if (valid.length === 0) next.delete('markets');
      else next.set('markets', [...new Set(valid)].join(','));
    }
  }
  return next.toString() === params.toString() ? null : next;
}

/** My listings filter (the `status` query parameter); "all" sends no status. */
export const LISTING_FILTERS = /** @type {const} */ (['all', 'active', 'sold_out', 'removed']);
export const LISTING_FILTER_OPTIONS = [
  { value: /** @type {const} */ ('all'), label: 'All' },
  { value: /** @type {const} */ ('active'), label: 'Active' },
  { value: /** @type {const} */ ('sold_out'), label: 'Sold out' },
  { value: /** @type {const} */ ('removed'), label: 'Removed' },
];
