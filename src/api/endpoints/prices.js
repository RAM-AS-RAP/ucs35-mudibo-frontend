import { api, unwrap } from '../client';

/** @typedef {import('../schema').components['schemas']} Schemas */
/** @typedef {Schemas['MarketSummary']} MarketSummary */
/** @typedef {Schemas['CurrentPricesResponse']} CurrentPricesResponse */
/** @typedef {Schemas['CurrentPriceItem']} CurrentPriceItem */
/** @typedef {Schemas['PriceTrend']} PriceTrend */
/** @typedef {Schemas['CropType']} CropType */
/** @typedef {import('../schema').paths['/api/v1/prices/trends']['get']['parameters']['query']['market']} MarketName */

/**
 * GET /api/v1/markets (farmer, admin). Only markets that have price data are listed.
 * @returns {Promise<MarketSummary[]>}
 */
export function getMarkets() {
  return unwrap(api.GET('/api/v1/markets'));
}

/**
 * GET /api/v1/prices/current (farmer, admin): the latest monthly price of every market with data,
 * as `{ items: CurrentPriceItem[], as_of_note }`. `previous_*` and `change_pct` are null when the
 * month before has no price. `as_of_note` is not displayed (relative time rule).
 * @param {CropType} crop
 * @returns {Promise<CurrentPricesResponse>}
 */
export function getCurrentPrices(crop) {
  return unwrap(api.GET('/api/v1/prices/current', { params: { query: { crop } } }));
}

/**
 * GET /api/v1/prices/trends (farmer, admin): monthly points in ascending order. Missing months
 * are absent, not filled.
 * @param {{ market: MarketName, crop: CropType, months?: number }} params  months 1 to 60 (default 24)
 * @returns {Promise<PriceTrend>}
 */
export function getPriceTrends({ market, crop, months }) {
  return unwrap(
    api.GET('/api/v1/prices/trends', {
      params: { query: { market, crop, ...(months === undefined ? {} : { months }) } },
    }),
  );
}
