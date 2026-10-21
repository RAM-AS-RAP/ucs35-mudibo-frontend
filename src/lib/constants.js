/**
 * Buyer checkout and payment constants (F3).
 *
 * The server is the authority for every rule below: it rejects an order that is too small, a
 * payment that starts too close to the expiry, and so on. These copies only let the screens
 * explain a rule before the request is sent, or pace their own work (polling). When the
 * backend changes a limit, change it here too; the server's answer always wins.
 */

/** Smallest quantity a buyer can type, in kg. The server is the authority. */
export const MIN_ORDER_QUANTITY = 1;

/**
 * Smallest order total in KES (the server answers 422 `order_too_small` below it). The value is
 * not in openapi.json or frontend_contract.md; it mirrors the backend setting. The server is
 * the authority.
 */
export const MIN_ORDER_TOTAL_KES = 10;

/** Largest quantity the quantity field accepts, in kg. The server is the authority. */
export const MAX_QUANTITY = 100000;

/**
 * The server refuses to start a payment this close to the order's expiry (409 `order_expiring`
 * with reason `too_close`, and `can_pay` false). Used only to explain why Pay is disabled.
 * The server is the authority.
 */
export const MIN_SECONDS_BEFORE_EXPIRY_TO_PAY = 90;

/** Poll GET /orders/{id} every 3 seconds while a payment prompt is open (frontend_contract.md). */
export const POLL_INTERVAL_MS = 3000;

/** Stop polling 150 seconds after a payment started (frontend_contract.md). */
export const POLL_WINDOW_MS = 150000;

/** Largest price per kg the browse price filter accepts. The server is the authority. */
export const PRICE_FILTER_MAX = 100000;

/** Payment attempts per order before the server answers `max_attempts_reached`. Server authority. */
export const MAX_PAYMENT_ATTEMPTS = 3;
