/**
 * List filters held in the URL query string, shared by the farmer's orders (F2b) and the
 * buyer's orders (F3). Only non sensitive values are stored, each validated against its allowed
 * values; an invalid value is removed so the default applies.
 */

/**
 * @template {string} T
 * @param {string | null} value
 * @param {readonly T[]} allowed
 * @param {T} fallback
 * @returns {T}
 */
export function pickValue(value, allowed, fallback) {
  return allowed.includes(/** @type {T} */ (value)) ? /** @type {T} */ (value) : fallback;
}

/**
 * Orders filter (the `status` query parameter). The order list routes filter by one status;
 * "not_paid" groups expired, cancelled and payment_failed on the client (filterNotPaid).
 */
export const ORDER_FILTERS = /** @type {const} */ ([
  'all',
  'paid',
  'pending_payment',
  'not_paid',
  'needs_reconciliation',
]);
export const ORDER_FILTER_OPTIONS = [
  { value: /** @type {const} */ ('all'), label: 'All' },
  { value: /** @type {const} */ ('paid'), label: 'Paid' },
  { value: /** @type {const} */ ('pending_payment'), label: 'Waiting for payment' },
  { value: /** @type {const} */ ('not_paid'), label: 'Not paid' },
  { value: /** @type {const} */ ('needs_reconciliation'), label: 'Under review' },
];
export const NOT_PAID_STATUSES = Object.freeze(['expired', 'cancelled', 'payment_failed']);

/**
 * The status to send for an orders filter: one order status, or null for "all" and for
 * "not_paid" (which loads every order and filters on the client).
 * @param {(typeof ORDER_FILTERS)[number]} filter
 * @returns {'paid' | 'pending_payment' | 'needs_reconciliation' | null}
 */
export function orderFilterStatus(filter) {
  return filter === 'all' || filter === 'not_paid' ? null : filter;
}

/**
 * The expired, cancelled and failed orders among those loaded so far.
 * @template {{ status: string }} T
 * @param {T[]} orders
 * @returns {T[]}
 */
export function filterNotPaid(orders) {
  return orders.filter((order) => NOT_PAID_STATUSES.includes(order.status));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value is a UUID (an id in the URL).
 * @param {string | null | undefined} value
 */
export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * The query string with an invalid `status` (and, when `listing` is allowed, an invalid
 * `listing` id) removed; null when nothing needs to change.
 * @param {URLSearchParams} params
 * @param {{ statuses: readonly string[], listing?: boolean }} rules
 */
export function cleanFilterParams(params, { statuses, listing = false }) {
  const next = new URLSearchParams(params);
  const status = next.get('status');
  if (status !== null && (status === 'all' || !statuses.includes(status))) next.delete('status');
  if (listing) {
    const id = next.get('listing');
    if (id !== null && !isUuid(id)) next.delete('listing');
  } else {
    next.delete('listing');
  }
  return next.toString() === params.toString() ? null : next;
}
