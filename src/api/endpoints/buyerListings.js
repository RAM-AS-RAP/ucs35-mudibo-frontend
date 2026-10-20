import { api, unwrap } from '../client';

/** @typedef {import('../schema').components['schemas']} Schemas */
/** @typedef {Schemas['CropType']} CropType */
/** @typedef {Schemas['ListingSort']} ListingSort */

/**
 * A listing as a buyer sees it (PublicListingOut). openapi.json names the fields without types,
 * so they are described here. There is never a farmer id, phone number or email: only the
 * seller's name. Money and quantities are JSON numbers with 2 decimals.
 * @typedef {object} PublicListing
 * @property {string} id
 * @property {CropType} crop
 * @property {string} market
 * @property {number} quantity_available  available now
 * @property {string} unit
 * @property {number} price_per_unit  KES per kg
 * @property {string | null} image_url
 * @property {string} seller_name
 * @property {string} status
 * @property {string} created_at
 */

/**
 * One listing (PublicListingDetail): also active and sold out listings, with `available`.
 * @typedef {PublicListing & { available: boolean }} PublicListingDetail
 */

/** @typedef {{ items: PublicListing[], total: number, limit: number, offset: number }} PublicListingPage */

/**
 * @typedef {object} BrowseFilters
 * @property {CropType | null} [crop]
 * @property {string | null} [market]
 * @property {string | null} [minPrice]  a normalised decimal string
 * @property {string | null} [maxPrice]  a normalised decimal string
 * @property {ListingSort | null} [sort]
 * @property {number} [limit]
 * @property {number} [offset]
 */

/**
 * GET /api/v1/listings (buyer): active listings with stock, newest first by default. The server
 * hides listings of disabled farmers. 422 for an unknown market or min_price above max_price.
 * Prices are sent as the decimal strings the buyer typed (the spec accepts number or string).
 * @param {BrowseFilters} [filters]
 * @returns {Promise<PublicListingPage>}
 */
export async function browseListings({
  crop,
  market,
  minPrice,
  maxPrice,
  sort,
  limit,
  offset,
} = {}) {
  const query = {
    ...(crop ? { crop } : {}),
    ...(market ? { market } : {}),
    ...(minPrice ? { min_price: minPrice } : {}),
    ...(maxPrice ? { max_price: maxPrice } : {}),
    ...(sort ? { sort } : {}),
    ...(limit === undefined ? {} : { limit }),
    ...(offset === undefined ? {} : { offset }),
  };
  const page = await unwrap(api.GET('/api/v1/listings', { params: { query } }));
  return /** @type {PublicListingPage} */ (/** @type {unknown} */ (page));
}

/**
 * GET /api/v1/listings/{listing_id} (buyer). Removed or unknown: 404 listing_not_found.
 * @param {string} id
 * @returns {Promise<PublicListingDetail>}
 */
export async function getListing(id) {
  const listing = await unwrap(
    api.GET('/api/v1/listings/{listing_id}', { params: { path: { listing_id: id } } }),
  );
  return /** @type {PublicListingDetail} */ (/** @type {unknown} */ (listing));
}
