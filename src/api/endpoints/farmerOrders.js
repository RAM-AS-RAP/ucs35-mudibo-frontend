import { api, unwrap } from '../client';

/** @typedef {import('../schema').components['schemas']} Schemas */
/** @typedef {Schemas['OrderStatus']} OrderStatus */

/**
 * An order on one of the farmer's listings. FarmerOrderOut in openapi.json names the fields
 * without types, so they are described here. There is never a buyer phone, email or id.
 * `total_amount` is the server's total; show it as returned, never recompute it.
 * @typedef {object} FarmerOrder
 * @property {string} order_id
 * @property {string} reference
 * @property {string} listing_id
 * @property {'maize' | 'beans'} crop
 * @property {string} market
 * @property {number} quantity
 * @property {number} unit_price
 * @property {number} total_amount
 * @property {OrderStatus} status
 * @property {string} created_at
 * @property {string} buyer_name
 * @property {string | null} payment_status
 * @property {string | null} payment_environment
 * @property {string | null} mpesa_receipt_number
 * @property {string | null} payment_completed_at
 */

/**
 * @typedef {{ items: FarmerOrder[], total: number, limit: number, offset: number, note: string }} FarmerOrdersPage
 */

/**
 * GET /api/v1/listings/mine/orders (farmer): orders on the farmer's listings, with a `note`
 * about sandbox payments. `status` takes one order status (the API accepts only one).
 * @param {{ status?: OrderStatus | null, listingId?: string | null, limit?: number, offset?: number }} [params]
 * @returns {Promise<FarmerOrdersPage>}
 */
export async function getMyOrders({ status, listingId, limit, offset } = {}) {
  const query = {
    ...(status ? { status } : {}),
    ...(listingId ? { listing_id: listingId } : {}),
    ...(limit === undefined ? {} : { limit }),
    ...(offset === undefined ? {} : { offset }),
  };
  const page = await unwrap(api.GET('/api/v1/listings/mine/orders', { params: { query } }));
  return /** @type {FarmerOrdersPage} */ (/** @type {unknown} */ (page));
}
