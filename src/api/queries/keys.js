/**
 * Query keys of every TanStack Query hook. Keys hold only non sensitive request parameters
 * (market, crop, horizon, months, a status filter, a listing id): never a token, a phone number
 * or an email.
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

  /** Every query about the farmer's own listings (lists, one listing, counts). */
  myListingsRoot: () => /** @type {const} */ (['listings', 'mine']),
  /** @param {{ status: string | null }} params  null means all statuses */
  myListings: ({ status }) =>
    /** @type {const} */ (['listings', 'mine', 'list', { status: status ?? 'all' }]),
  /** @param {string} id */
  myListing: (id) => /** @type {const} */ (['listings', 'mine', 'one', { id }]),
  /** @param {{ status: string }} params */
  myListingCount: ({ status }) => /** @type {const} */ (['listings', 'mine', 'count', { status }]),

  /** Every query about orders on the farmer's listings. */
  myOrdersRoot: () => /** @type {const} */ (['farmer-orders']),
  /** @param {{ status: string | null, listingId: string | null }} params */
  myOrders: ({ status, listingId }) =>
    /** @type {const} */ ([
      'farmer-orders',
      'list',
      { status: status ?? 'all', listingId: listingId ?? 'all' },
    ]),
  /** @param {{ status: string }} params */
  myOrderCount: ({ status }) => /** @type {const} */ (['farmer-orders', 'count', { status }]),
});
