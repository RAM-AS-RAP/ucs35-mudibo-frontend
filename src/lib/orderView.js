/**
 * What the buyer's order screen shows for an order (F3). One pure function turns the server's
 * order into a "kind" of panel, the seconds left before it expires (on the server's clock), and
 * the button flags. The flags are the server's `can_pay` and `can_cancel`, copied, never forced
 * to true: the server already accounts for the expiry margin, open payments and the attempt limit.
 */
import { MAX_PAYMENT_ATTEMPTS, MIN_SECONDS_BEFORE_EXPIRY_TO_PAY } from './constants';

/**
 * The parts of OrderOut this module reads. openapi.json names OrderOut's fields without types;
 * the types follow frontend_contract.md and OrderPaymentSummary.
 * @typedef {object} OrderLike
 * @property {string} status
 * @property {boolean} is_expired
 * @property {string} expires_at
 * @property {boolean} can_pay
 * @property {boolean} can_cancel
 * @property {{ status: string, attempts?: number, result_desc?: string | null, status_message?: string } | null} payment
 */

/**
 * @typedef {'pay_ready' | 'too_close' | 'max_attempts' | 'awaiting_phone' | 'payment_cancelled'
 *   | 'payment_failed' | 'payment_timeout' | 'paid' | 'expired' | 'cancelled' | 'under_review'
 *   | 'closed_other'} OrderViewKind
 */

/**
 * @typedef {object} OrderView
 * @property {OrderViewKind} kind
 * @property {number} remainingSeconds  whole seconds before `expires_at` on the server's clock
 * @property {string} headline
 * @property {boolean} canPay  the server's can_pay
 * @property {boolean} canCancel  the server's can_cancel
 * @property {boolean} waitingForPhone  a payment prompt is open (keep polling)
 * @property {boolean} showReason  the payment's result_desc should be shown
 */

/** Payment statuses while the prompt is still open on the buyer's phone. */
export const OPEN_PAYMENT_STATUSES = Object.freeze(['initiating', 'initiated']);

/** Order statuses that never change again (polling stops). */
export const FINAL_ORDER_STATUSES = Object.freeze([
  'paid',
  'payment_failed',
  'expired',
  'cancelled',
  'needs_reconciliation',
]);

/** @type {Readonly<Record<OrderViewKind, string>>} */
export const ORDER_VIEW_HEADLINES = Object.freeze({
  pay_ready: 'Pay with M-Pesa to complete your order',
  too_close: 'Not enough time left to pay',
  max_attempts: 'No payment attempts left',
  awaiting_phone: 'Check your phone and enter your M-Pesa PIN',
  payment_cancelled: 'Payment request cancelled',
  payment_failed: 'The payment did not go through',
  payment_timeout: 'The payment request timed out',
  paid: 'Payment received (test)',
  expired: 'This order expired',
  cancelled: 'Order cancelled',
  under_review: 'Your payment is under review',
  closed_other: 'This order is closed',
});

/**
 * Whether the latest payment is still waiting for the buyer's phone. A `completed` payment on
 * an order that is still `pending_payment` counts too: the contract says to keep polling until
 * the order turns `paid` (usually the same response).
 * @param {OrderLike | null | undefined} order
 */
export function hasOpenPayment(order) {
  if (!order || order.status !== 'pending_payment' || !order.payment) return false;
  return (
    OPEN_PAYMENT_STATUSES.includes(order.payment.status) || order.payment.status === 'completed'
  );
}

/**
 * Seconds left before `expires_at`, measured on the server's clock: the device time plus the
 * offset measured when the response arrived. Rounded down; never below 0.
 * @param {string | null | undefined} expiresAt
 * @param {{ nowMs: number, offsetMs: number }} clock
 */
export function remainingSecondsUntil(expiresAt, { nowMs, offsetMs }) {
  const end = typeof expiresAt === 'string' ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(end) || !Number.isFinite(nowMs)) return 0;
  const offset = Number.isFinite(offsetMs) ? offsetMs : 0;
  return Math.max(0, Math.floor((end - (nowMs + offset)) / 1000));
}

/**
 * @param {OrderLike} order
 * @param {number} remainingSeconds
 * @returns {OrderViewKind}
 */
function kindOf(order, remainingSeconds) {
  switch (order.status) {
    case 'paid':
      return 'paid';
    case 'needs_reconciliation':
      return 'under_review';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'pending_payment':
      break;
    default:
      return 'closed_other';
  }
  // A prompt that is still open wins: the payment may still complete.
  if (hasOpenPayment(order)) return 'awaiting_phone';
  if (order.is_expired) return 'expired';
  const payment = order.payment;
  if (!order.can_pay) {
    if (payment && (payment.attempts ?? 0) >= MAX_PAYMENT_ATTEMPTS) return 'max_attempts';
    if (remainingSeconds <= MIN_SECONDS_BEFORE_EXPIRY_TO_PAY) return 'too_close';
  }
  if (payment?.status === 'cancelled') return 'payment_cancelled';
  if (payment?.status === 'failed') return 'payment_failed';
  if (payment?.status === 'timeout') return 'payment_timeout';
  return 'pay_ready';
}

/**
 * The panel, the time left and the button flags for an order.
 * @param {OrderLike} order
 * @param {{ nowMs: number, offsetMs: number }} clock  offsetMs = server time minus device time
 * @returns {OrderView}
 */
export function deriveOrderView(order, { nowMs, offsetMs }) {
  const remainingSeconds = remainingSecondsUntil(order.expires_at, { nowMs, offsetMs });
  const kind = kindOf(order, remainingSeconds);
  const reason = order.payment?.result_desc;
  return {
    kind,
    remainingSeconds,
    headline: ORDER_VIEW_HEADLINES[kind],
    // Copied from the server; the client never turns either on.
    canPay: order.can_pay === true,
    canCancel: order.can_cancel === true,
    waitingForPhone: kind === 'awaiting_phone',
    showReason: kind === 'payment_failed' && typeof reason === 'string' && reason.trim() !== '',
  };
}
