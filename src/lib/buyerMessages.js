/*
 * User facing text of the buyer browse, checkout, payment and orders screens (F3), in one place.
 * Plain English; amounts after checkout always come from the server. Payments run in the
 * Safaricom M-Pesa sandbox and no real money moves. Backend error codes keep their messages in
 * src/api/errors.js; payment errors in src/lib/payErrors.js.
 */

// Order and payment status words live with the farmer's in lib/messages.js (StatusBadge).
export { ORDER_STATUS_WORDS, PAYMENT_STATUS_WORDS } from './messages';

export const SANDBOX_TEXT = Object.freeze({
  fallback:
    'This is a research prototype. Payments run in a test environment and no real money is taken. Delivery is not part of this prototype.',
  pin: 'Enter your M-Pesa PIN only on the prompt on your phone. AgriSence never asks for your PIN.',
});

export const BROWSE_TEXT = Object.freeze({
  title: 'Browse produce',
  description: 'Maize and beans listed by farmers.',
  priceNote: 'Prices are set by the farmers selling the produce.',
  cropLegend: 'Crop',
  allCrops: 'All',
  marketLabel: 'Market',
  allMarkets: 'All markets',
  marketsError: 'The list of markets could not be loaded.',
  marketsRetry: 'Load markets again',
  minPriceLabel: 'Lowest price (KES per kg)',
  maxPriceLabel: 'Highest price (KES per kg)',
  priceHint: 'Leave empty for no limit.',
  minAboveMax: 'The lowest price cannot be above the highest price.',
  sortLabel: 'Sort by',
  clearFilters: 'Clear filters',
  loading: 'Loading produce…',
  loadingMore: 'Loading more…',
  loadMore: 'Load more',
  /** @param {number} shown @param {number} total */
  showing: (shown, total) => `Showing ${shown} of ${total}`,
  emptyTitle: 'No produce is listed right now. Please check again soon.',
  emptyFilteredTitle: 'No listings match these filters.',
  errorTitle: 'Produce could not be loaded',
  filterProblemTitle: 'These filters could not be used',
  /** @param {string} price  "KES 42.00" */
  perKg: (price) => `${price} per kg`,
  /** @param {string} qty  "120.5" */
  available: (qty) => `${qty} kg available`,
  /** @param {string} name */
  soldBy: (name) => `Sold by ${name}`,
  /** @param {string} crop  "maize" */
  photoAlt: (crop) => `Photo of ${crop} for sale`,
});

export const LISTING_DETAIL_TEXT = Object.freeze({
  title: 'Produce details',
  loading: 'Loading the listing…',
  errorTitle: 'The listing could not be loaded',
  unavailable: 'This listing is no longer available.',
  unavailableTitle: 'Listing not available',
  browseOther: 'Browse other produce',
  soldOutTitle: 'Sold out',
  soldOutText: 'This produce is sold out. Other farmers may have the same crop.',
  quantityLabel: 'Quantity (kg)',
  /** @param {string} max  "120.5" */
  quantityHint: (max) => `At least 1 kg and at most ${max} kg. Use a dot for decimals.`,
  decrease: 'Decrease quantity by 1 kg',
  increase: 'Increase quantity by 1 kg',
  minQuantity: 'Order at least 1 kg.',
  /** @param {string} qty  "12.5" */
  onlyAvailable: (qty) => `Only ${qty} kg available.`,
  minimumTotal: 'The minimum order is KES 10.',
  checkout: 'Continue to checkout',
  creating: 'Creating your order…',
  created: 'Order created. Complete payment within 5 minutes.',
  existing:
    'You already have an order waiting for payment for this listing. Continue it or cancel it first.',
  uncertain:
    'We could not confirm whether your order was created. Check My orders before trying again.',
  goToMyOrders: 'Go to My orders',
  seeWaitingOrders: 'See orders waiting for payment',
  summaryTitle: 'The order was not created',
  /** @param {string} qty */
  stockUpdated: (qty) => `The available quantity was updated: ${qty} kg available now.`,
});

export const CHECKOUT_TEXT = Object.freeze({
  title: 'Order summary',
  listing: 'Produce',
  quantity: 'Quantity',
  pricePerKg: 'Price per kg',
  estimate: 'Estimated total',
  estimateNote: 'Estimate. The final amount is confirmed when you check out.',
  hold: 'After checkout the produce is held for you for about 5 minutes while you pay.',
  noEstimate: 'Enter a quantity to see the estimate.',
});

export const ORDER_SCREEN_TEXT = Object.freeze({
  title: 'Your order',
  loading: 'Loading your order…',
  errorTitle: 'The order could not be loaded',
  notFound: 'This order could not be found.',
  notFoundTitle: 'Order not found',
  myOrders: 'My orders',
  browse: 'Browse produce',
  reference: 'Reference',
  copy: 'Copy reference',
  copied: 'Reference copied',
  copyFailed: 'The reference could not be copied. Select it and copy it by hand.',
  quantity: 'Quantity',
  unitPrice: 'Price per kg',
  total: 'Total',
  ordered: 'Ordered',
  /** @param {string} name */
  soldBy: (name) => `Sold by ${name}`,
  /** @param {string} crop  "maize" */
  photoAlt: (crop) => `Photo of ${crop}`,
  /** @param {string} time  "4:59" */
  countdown: (time) => `Complete payment within ${time}`,
  countdown60: 'One minute left to complete the payment.',
  countdown30: '30 seconds left to complete the payment.',
  countdownExpired: 'The time to pay has ended.',
  pay: 'Pay with M-Pesa',
  payHint:
    'You will get a prompt on your registered phone number. Approve it with your M-Pesa PIN.',
  checkPayment: 'Check payment request',
  sending: 'Sending request',
  tryAgain: 'Try again',
  checkAgain: 'Check again',
  cancel: 'Cancel order',
  cancelTitle: 'Cancel this order?',
  cancelText: 'The produce is released for other buyers.',
  cancelConfirm: 'Cancel order',
  cancelKeep: 'Keep order',
  cancelling: 'Cancelling…',
  cancelled: 'Order cancelled',
  cancelBlocked: 'A payment is in progress. Please wait for it to finish.',
  notCancellable: 'This order can no longer be cancelled. Its current state is shown below.',
  /** @param {string} masked */
  promptSent: (masked) => `Prompt sent to ${masked}`,
  promptTip:
    'If you did not get a prompt, wait for this one to expire before trying again. Only one prompt can be active on a phone.',
  noResult:
    'We have not received a result yet. Your order stays open until the timer ends. Check again, or leave and find this order in My orders.',
  readyText: 'Pay before the timer ends, or the produce is released for other buyers.',
  notPayableNow: 'Payment cannot be started for this order right now.',
  tooCloseText:
    'There is not enough time left to start a payment. Cancel this order and start again.',
  maxAttemptsText: 'You have tried to pay for this order 3 times. Cancel it and start a new order.',
  cancelledPayment: 'You cancelled the payment request.',
  /** @param {string} reason */
  reason: (reason) => `Reason: ${reason}`,
  failedFallback: 'The payment did not complete.',
  timeoutFallback: 'The payment request timed out.',
  paidText:
    'This was a test payment in the M-Pesa sandbox: no real money moved. Delivery is not part of this prototype.',
  /** @param {string} receipt */
  receipt: (receipt) => `Receipt ${receipt}`,
  expiredText: 'This order expired and the produce was released. You can start a new order.',
  orderAgain: 'Order this produce again',
  cancelledText: 'You cancelled this order.',
  /** @param {string} reference */
  reviewText: (reference) =>
    `Your payment is under review. If money was taken, an administrator will check it. Keep your reference ${reference}.`,
  closedText:
    'This order is closed because the payment did not complete. You can start a new order.',
});

export const MY_ORDERS_TEXT = Object.freeze({
  title: 'My orders',
  filterLegend: 'Show',
  refresh: 'Refresh',
  loadMore: 'Load more',
  loadingMore: 'Loading more…',
  /** @param {number} shown @param {number} total */
  showing: (shown, total) => `Showing ${shown} of ${total}`,
  /** @param {number} shown @param {number} loaded @param {number} total */
  notPaidShowing: (shown, loaded, total) =>
    `${shown} not paid among the ${loaded} of ${total} orders loaded.`,
  notPaidNote:
    'Not paid groups expired, cancelled and failed orders from the orders loaded so far. Load more to check older orders.',
  emptyTitle: 'You have no orders yet.',
  emptyFilteredTitle: 'No orders with this status.',
  browse: 'Browse produce',
  loading: 'Loading your orders…',
  errorTitle: 'Your orders could not be loaded',
  continuePayment: 'Continue payment',
});
