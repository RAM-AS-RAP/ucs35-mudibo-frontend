/**
 * Query keys of every TanStack Query hook. Keys hold only non sensitive request parameters
 * (market, crop, horizon, months): never a token, a phone number or an email.
 */
export const queryKeys = Object.freeze({
  markets: () => /** @type {const} */ (['markets']),
  /** @param {string} crop */
  currentPrices: (crop) => /** @type {const} */ (['prices', 'current', { crop }]),
  /** @param {{ market: string, crop: string, months: number }} params */
  priceTrends: ({ market, crop, months }) =>
    /** @type {const} */ (['prices', 'trends', { market, crop, months }]),
  /** @param {{ market: string, crop: string, horizon: string }} params */
  forecast: ({ market, crop, horizon }) =>
    /** @type {const} */ (['forecasts', { market, crop, horizon }]),
});
