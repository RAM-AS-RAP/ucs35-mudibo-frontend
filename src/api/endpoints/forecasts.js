import { api, unwrap } from '../client';
import { ApiError } from '../errors';

/** @typedef {import('../schema').components['schemas']} Schemas */
/** @typedef {Schemas['CropType']} CropType */
/** @typedef {Schemas['ForecastHorizon']} ForecastHorizon */
/** @typedef {import('../schema').paths['/api/v1/forecasts']['get']['parameters']['query']['market']} MarketName */

/**
 * A forecast as the backend returns it. The 200 response has no schema in openapi.json, so the
 * fields are described here and checked at runtime (src/lib/shapSchema.js) before display.
 * @typedef {object} Forecast
 * @property {string} market
 * @property {CropType} crop
 * @property {ForecastHorizon} horizon
 * @property {string} origin_month
 * @property {string} target_month
 * @property {number} origin_price
 * @property {number} predicted_price
 * @property {number} predicted_log_change
 * @property {number} expected_change_pct
 * @property {unknown} shap_values
 * @property {string} generated_at
 * @property {string} based_on
 * @property {string} for_month
 */

/** Reasons the backend gives for 404 `forecast_unavailable`. */
export const FORECAST_UNAVAILABLE_REASONS = Object.freeze(['no_forecast', 'stale']);

/**
 * @typedef {{ status: 'ok', data: Forecast } | { status: 'unavailable', reason: 'no_forecast' | 'stale' }} ForecastResult
 */

/**
 * GET /api/v1/forecasts (farmer, admin). Only a 404 `forecast_unavailable` becomes a normal
 * result, `{ status: 'unavailable', reason }`; every other error (including 404
 * `market_not_available`) still throws ApiError.
 * @param {{ market: MarketName, crop: CropType, horizon: ForecastHorizon }} params
 * @returns {Promise<ForecastResult>}
 */
export async function getForecast({ market, crop, horizon }) {
  try {
    const data = await unwrap(
      api.GET('/api/v1/forecasts', { params: { query: { market, crop, horizon } } }),
    );
    return { status: 'ok', data: /** @type {Forecast} */ (data) };
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404 &&
      error.code === 'forecast_unavailable'
    ) {
      const reason = error.reason === 'stale' ? 'stale' : 'no_forecast';
      return { status: 'unavailable', reason };
    }
    throw error;
  }
}
