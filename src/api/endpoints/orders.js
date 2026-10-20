import { api, unwrap } from '../client';
import { ApiError } from '../errors';

/** @typedef {import('../schema').components['schemas']} Schemas */
/** @typedef {Schemas['OrderStatus']} OrderStatus */
/** @typedef {Schemas['PaymentStatus']} PaymentStatus */

/**
 * The latest payment of an order (OrderPaymentSummary): no identifiers and no full phone
 * number, only the masked prompt target. The receipt is null when the payment was confirmed by
 * a status query.
 * @typedef {object} OrderPayment
 * @property {PaymentStatus} status
 * @property {string} status_message
 * @property {string} stk_target_masked
 * @property {string | null} mpesa_receipt_number
 * @property {string | null} result_desc
 * @property {string | null} completed_at
 * @property {number} attempts
 */

/**
 * The listing inside an order (OrderListingSummary): the seller's name only.
 * @typedef {object} OrderListing
 * @property {string} id
 * @property {'maize' | 'beans'} crop
 * @property {string} market
 * @property {string} unit
 * @property {string | null} image_url
 * @property {string} seller_name
 * @property {string} status
 */

/**
 * A buyer's order (OrderOut). openapi.json names its fields without types, so they are
 * described here. `total_amount` is the server's whole shilling total; show it as returned.
 * `can_pay` and `can_cancel` decide which buttons are enabled.
 * @typedef {object} Order
 * @property {string} id
 * @property {string} reference
 * @property {OrderStatus} status
 * @property {boolean} is_expired
 * @property {number} quantity
 * @property {number} unit_price
 * @property {number} total_amount
 * @property {string} expires_at
 * @property {string} server_time
 * @property {string} created_at
 * @property {boolean} can_pay
 * @property {boolean} can_cancel
 * @property {OrderListing} listing
 * @property {OrderPayment | null} payment
 * @property {string} [note]
 */

/** @typedef {{ items: Order[], total: number, limit: number, offset: number }} OrderPage */

/**
 * POST /api/v1/orders (buyer): reserves stock for about 5 minutes. The body is exactly
 * `{listing_id, quantity}`; the quantity is the decimal string the buyer typed (the spec
 * accepts number or string). Errors: 404 listing_not_found; 409 listing_unavailable,
 * insufficient_stock, pending_order_exists (with existing_order_id), too_many_pending_orders;
 * 422 order_too_small or validation_error; 429 rate_limited.
 * @param {{ listingId: string, quantity: string }} params
 * @returns {Promise<Order>}
 */
export async function createOrder({ listingId, quantity }) {
  const order = await unwrap(
    api.POST('/api/v1/orders', { body: { listing_id: listingId, quantity } }),
  );
  return /** @type {Order} */ (/** @type {unknown} */ (order));
}

/**
 * GET /api/v1/orders/{order_id} (buyer). A missing order and someone else's order both answer
 * 404 order_not_found. The server may check the payment with Safaricom during this call.
 * @param {string} id
 * @returns {Promise<Order>}
 */
export async function getOrder(id) {
  const order = await unwrap(
    api.GET('/api/v1/orders/{order_id}', { params: { path: { order_id: id } } }),
  );
  return /** @type {Order} */ (/** @type {unknown} */ (order));
}

/**
 * GET /api/v1/orders/mine (buyer): the buyer's orders, newest first. `status` takes one order
 * status (the API accepts only one). Exported from endpoints/index.js as getMyBuyerOrders,
 * because the farmer's getMyOrders has the same name.
 * @param {{ status?: OrderStatus | null, limit?: number, offset?: number }} [params]
 * @returns {Promise<OrderPage>}
 */
export async function getMyOrders({ status, limit, offset } = {}) {
  const query = {
    ...(status ? { status } : {}),
    ...(limit === undefined ? {} : { limit }),
    ...(offset === undefined ? {} : { offset }),
  };
  const page = await unwrap(api.GET('/api/v1/orders/mine', { params: { query } }));
  return /** @type {OrderPage} */ (/** @type {unknown} */ (page));
}

/**
 * POST /api/v1/orders/{order_id}/cancel (buyer): 200 with the order, also when it was already
 * cancelled. Errors: 409 order_not_cancellable or payment_in_progress, 404 order_not_found.
 * @param {string} id
 * @returns {Promise<Order>}
 */
export async function cancelOrder(id) {
  const order = await unwrap(
    api.POST('/api/v1/orders/{order_id}/cancel', { params: { path: { order_id: id } } }),
  );
  return /** @type {Order} */ (/** @type {unknown} */ (order));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The open order named by a 409 pending_order_exists (`error.extra.existing_order_id`), or null
 * for any other error or a value that is not a UUID.
 * @param {unknown} error
 * @returns {string | null}
 */
export function existingOrderId(error) {
  if (!(error instanceof ApiError) || error.code !== 'pending_order_exists') return null;
  const id = error.extra.existing_order_id;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}
