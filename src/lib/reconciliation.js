/**
 * Plain language for the order review (reconciliation) workflow (F4). The sentences state what
 * was observed and what an action will do; they never claim certainty about where money is.
 * The server decides the actual effect of an action and answers with the resolved order.
 */

/** @type {Readonly<Record<string, string>>} */
const REASONS = Object.freeze({
  late_success_after_expiry:
    'A payment confirmation arrived after this order had expired. The produce may already have been released to other buyers.',
  success_on_closed_payment:
    'A payment confirmation arrived for a payment request that had already been closed, for example after it was recorded as cancelled or timed out. The buyer may have paid even though the order shows no payment.',
  success_on_closed_order:
    'A payment confirmation arrived after this order had been closed. The buyer may have paid for an order that is no longer open.',
  amount_mismatch:
    'The amount in the payment confirmation did not match the order total. Check the payment events before deciding.',
});

export const GENERIC_REASON =
  'A payment arrived in a state the system did not expect, so this order was set aside for review. Check the payment events before deciding.';

/**
 * One sentence on why an order needs review, from `reconciliation.reason`.
 * @param {string | null | undefined} reason
 */
export function describeReason(reason) {
  if (typeof reason === 'string' && Object.prototype.hasOwnProperty.call(REASONS, reason)) {
    return REASONS[reason];
  }
  return GENERIC_REASON;
}

export const PAYMENT_RECORD_NOTE =
  'The payment record stays as it is. Any refund must be handled outside AgriSence.';

/** Order statuses in which the reserved produce was already given back to the listing. */
const RELEASED = new Set(['expired', 'cancelled', 'payment_failed']);

/**
 * The consequences of a resolve action, shown in its confirmation dialog, given the order's
 * status before it was flagged (`reconciliation.order_status_before`).
 * @param {'confirm_sale' | 'void_order'} action
 * @param {string | null | undefined} orderStatusBefore
 * @returns {string[]}  sentences, the payment record note last
 */
export function describeEffect(action, orderStatusBefore) {
  const reserved = orderStatusBefore === 'pending_payment';
  const released = typeof orderStatusBefore === 'string' && RELEASED.has(orderStatusBefore);
  /** @type {string} */
  let effect;
  if (action === 'confirm_sale') {
    if (reserved) effect = 'The order becomes paid. The reserved produce stays with this buyer.';
    else if (released)
      effect =
        'The order becomes paid and the produce is reserved for this buyer again, if enough is left in the listing.';
    else
      effect =
        'The order becomes paid. The server reserves the produce for this buyer if it is not already reserved and enough is left in the listing.';
  } else if (reserved) {
    effect = 'The order is cancelled and the reserved produce goes back to the listing.';
  } else if (released) {
    effect =
      'The order is cancelled. The produce was already released, so the listing does not change.';
  } else {
    effect = 'The order is cancelled. Any produce still reserved for it goes back to the listing.';
  }
  return [effect, PAYMENT_RECORD_NOTE];
}
