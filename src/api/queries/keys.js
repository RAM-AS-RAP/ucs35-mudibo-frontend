/**
 * Query keys of every TanStack Query hook. Keys hold only non sensitive request parameters
 * (market, crop, horizon, months, a status filter, a listing id): never a token, a payment number
 * or an email.
 */

/** @type {Map<string, string>} */
const searchIds = new Map();

/**
 * An opaque id for a search text, for query keys (F4). An administrator may search users by
 * name or email; the key holds `s1`, `s2`, ... instead of the text itself.
 * @param {string | null | undefined} text
 * @returns {string}
 */
export function searchKey(text) {
  if (!text) return '';
  let id = searchIds.get(text);
  if (!id) {
    id = `s${searchIds.size + 1}`;
    searchIds.set(text, id);
  }
  return id;
}

export const queryKeys = Object.freeze({
  /** The signed in user's own profile (GET /auth/me). The key holds no email or token. */
  me: () => /** @type {const} */ (['auth', 'me']),
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

  /** Every query of the buyer's browse list and listing detail (F3). */
  browseRoot: () => /** @type {const} */ (['browse']),
  /**
   * @param {{ crop: string | null, market: string | null, minPrice: string | null, maxPrice: string | null, sort: string }} filters
   */
  browseListings: ({ crop, market, minPrice, maxPrice, sort }) =>
    /** @type {const} */ ([
      'browse',
      'list',
      {
        crop: crop ?? 'all',
        market: market ?? 'all',
        minPrice: minPrice ?? '',
        maxPrice: maxPrice ?? '',
        sort,
      },
    ]),
  /** @param {string} id */
  listing: (id) => /** @type {const} */ (['browse', 'one', { id }]),
  /** The markets the buyer browse filter offers (GET /listings/markets). */
  buyerMarkets: () => /** @type {const} */ (['browse', 'markets']),

  /** One of the buyer's orders. Never holds an idempotency key. @param {string} id */
  order: (id) => /** @type {const} */ (['order', { id }]),
  /** The buyer's order lists and the waiting count (refreshed after every order write). */
  buyerOrdersRoot: () => /** @type {const} */ (['buyer-orders']),
  /** @param {{ status: string | null }} params  null means all statuses */
  buyerOrders: ({ status }) =>
    /** @type {const} */ (['buyer-orders', 'list', { status: status ?? 'all' }]),
  waitingOrdersCount: () =>
    /** @type {const} */ (['buyer-orders', 'count', { status: 'pending_payment' }]),

  /* Administrator (F4). Search texts are replaced by searchKey() ids. */
  adminRoot: () => /** @type {const} */ (['admin']),
  adminStats: () => /** @type {const} */ (['admin', 'stats']),
  adminUsersRoot: () => /** @type {const} */ (['admin', 'users']),
  /** @param {{ role: string | null, isDisabled: boolean | null, q: string | null }} filters */
  adminUsers: ({ role, isDisabled, q }) =>
    /** @type {const} */ ([
      'admin',
      'users',
      { role: role ?? 'all', disabled: isDisabled ?? 'all', search: searchKey(q) },
    ]),
  adminInvitesRoot: () => /** @type {const} */ (['admin', 'invites']),
  /** @param {{ status: string | null }} filters */
  adminInvites: ({ status }) =>
    /** @type {const} */ (['admin', 'invites', { status: status ?? 'all' }]),
  adminListingsRoot: () => /** @type {const} */ (['admin', 'listings']),
  /** @param {{ status: string | null, crop: string | null, market: string | null, q: string | null }} filters */
  adminListings: ({ status, crop, market, q }) =>
    /** @type {const} */ ([
      'admin',
      'listings',
      {
        status: status ?? 'all',
        crop: crop ?? 'all',
        market: market ?? 'all',
        search: searchKey(q),
      },
    ]),
  /** Every admin order query: the lists, one order and the review count. */
  adminOrdersRoot: () => /** @type {const} */ (['admin', 'orders']),
  /** @param {{ status: string | null, q: string | null }} filters */
  adminOrders: ({ status, q }) =>
    /** @type {const} */ ([
      'admin',
      'orders',
      'list',
      { status: status ?? 'all', search: searchKey(q) },
    ]),
  /** @param {string} id */
  adminOrder: (id) => /** @type {const} */ (['admin', 'orders', 'one', { id }]),
  adminReviewCount: () =>
    /** @type {const} */ (['admin', 'orders', 'count', { status: 'needs_reconciliation' }]),
  adminPaymentsRoot: () => /** @type {const} */ (['admin', 'payments']),
  /**
   * @param {{ status: string | null, orderReference: string | null, environment: string | null, createdFrom: string | null, createdTo: string | null }} filters
   */
  adminPayments: ({ status, orderReference, environment, createdFrom, createdTo }) =>
    /** @type {const} */ ([
      'admin',
      'payments',
      'list',
      {
        status: status ?? 'all',
        reference: searchKey(orderReference),
        environment: environment ?? 'all',
        from: createdFrom ?? '',
        to: createdTo ?? '',
      },
    ]),
  /** @param {string} paymentId */
  paymentEvents: (paymentId) =>
    /** @type {const} */ (['admin', 'payments', 'events', { paymentId }]),
  /**
   * @param {{ market: string | null, crop: string | null, horizon: string | null, isBackfill: boolean | null, includePending: boolean }} filters
   */
  forecastAccuracy: ({ market, crop, horizon, isBackfill, includePending }) =>
    /** @type {const} */ ([
      'admin',
      'accuracy',
      {
        market: market ?? 'all',
        crop: crop ?? 'all',
        horizon: horizon ?? 'all',
        source: isBackfill === null ? 'all' : isBackfill ? 'backfill' : 'live',
        includePending,
      },
    ]),
});
