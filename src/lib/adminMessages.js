/**
 * User facing text of the administrator screens (F4), in one place: the messages for every admin
 * error code, the email check categories and each screen's text. Backend codes shared with
 * other screens keep their general message in src/api/errors.js; the admin screens use
 * adminErrorMessage(), which prefers the wording below.
 */
import { ApiError, getUserMessage } from '@/api/errors';

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** @param {number} seconds */
const secondsText = (seconds) => plural(seconds, 'second', 'seconds');

/**
 * Messages for the codes the admin routes answer with. `forbidden` has its admin meaning only
 * for a disable or enable (an ordinary administrator acting on another administrator); see
 * adminErrorMessage.
 */
export const ADMIN_ERROR_MESSAGES = Object.freeze({
  user_not_found: 'This user could not be found. The list has been refreshed.',
  cannot_modify_super_admin: 'The main administrator account cannot be changed.',
  cannot_disable_self: 'You cannot disable your own account.',
  forbidden: 'Only the main administrator can change another administrator.',
  user_exists: 'An account with this email already exists.',
  too_many_pending_invites:
    'There are too many open invitations. Revoke one before sending another.',
  invite_conflict: 'An invitation for this person was just created. Refresh the list.',
  invite_not_found: 'This invitation could not be found. The list has been refreshed.',
  invite_not_pending: 'This invitation is no longer open. The list has been refreshed.',
  resend_cooldown: 'Please wait a minute before sending another code.',
  send_limit_reached:
    'No more codes can be sent for this invitation. Revoke it and send a new invitation.',
  email_failed: 'The email could not be sent.',
  listing_not_found: 'This listing could not be found. The list has been refreshed.',
  listing_has_open_payments:
    'A payment is in progress for this listing. Try again in a few minutes.',
  order_not_found: 'This order could not be found.',
  order_not_in_reconciliation: 'This order is no longer waiting for review.',
  reconciliation_context_missing:
    'The record needed to resolve this order is missing. Do not change the order here; check the payment events.',
  insufficient_stock_to_confirm: 'Not enough produce is left in the listing to confirm this sale.',
  payment_not_found: 'This payment could not be found.',
});

/** The email check's failure categories (502 email_failed, `category` in the error object). */
export const EMAIL_FAILURE_MESSAGES = Object.freeze({
  connection_timeout:
    'The mail server could not be reached. The network or the hosting provider may block mail ports.',
  auth_failed: 'The mail server rejected the sign in details.',
  tls_failed: 'A secure connection to the mail server could not be made.',
  recipient_refused: 'The mail server refused the recipient.',
  other: 'The email could not be sent.',
});

/**
 * The message for a 502 email_failed, by its category (ApiError.extra.category).
 * @param {unknown} error
 */
export function emailFailureMessage(error) {
  const category = error instanceof ApiError ? error.extra.category : undefined;
  return typeof category === 'string' &&
    Object.prototype.hasOwnProperty.call(EMAIL_FAILURE_MESSAGES, category)
    ? EMAIL_FAILURE_MESSAGES[/** @type {keyof typeof EMAIL_FAILURE_MESSAGES} */ (category)]
    : EMAIL_FAILURE_MESSAGES.other;
}

/** After a write timed out or the network failed: the result is unknown. */
export const WRITE_UNKNOWN = Object.freeze({
  order:
    'We could not confirm whether the change was saved. Refresh this order to check before trying again.',
  list: 'We could not confirm whether the change was saved. Refresh the list to check before trying again.',
});

/**
 * Whether a write failed without an answer from the server (timeout or network error), so its
 * result is unknown and it must not be sent again automatically.
 * @param {unknown} error
 */
export function isUnknownWriteResult(error) {
  return error instanceof ApiError && (error.code === 'timeout' || error.code === 'network_error');
}

/**
 * Plain English message for an error on an admin screen.
 * @param {unknown} error
 * @param {{ userAction?: boolean }} [options]  userAction: a disable or enable, where 403
 *   `forbidden` means "only the main administrator can change another administrator"
 */
export function adminErrorMessage(error, { userAction = false } = {}) {
  if (!(error instanceof ApiError)) return getUserMessage(error);
  if (error.code === 'email_failed') return emailFailureMessage(error);
  if (error.code === 'resend_cooldown' && error.retryAfter) {
    return `Wait ${secondsText(error.retryAfter)} before sending another code.`;
  }
  if (error.code === 'forbidden' && !userAction) return getUserMessage(error);
  if (Object.prototype.hasOwnProperty.call(ADMIN_ERROR_MESSAGES, error.code)) {
    return ADMIN_ERROR_MESSAGES[/** @type {keyof typeof ADMIN_ERROR_MESSAGES} */ (error.code)];
  }
  return getUserMessage(error);
}

/** Text shared by the admin lists. */
export const ADMIN_COMMON = Object.freeze({
  refresh: 'Refresh',
  loadMore: 'Load more',
  loadingMore: 'Loading more…',
  /** @param {number} shown @param {number} total */
  showing: (shown, total) => `Showing ${shown} of ${total}`,
  clearFilters: 'Clear filters',
  cancel: 'Cancel',
  close: 'Close',
  actions: 'Actions',
  none: 'None',
  notYet: 'Not yet',
  viewEvents: 'View events',
  searchShort: (/** @type {number} */ min) => `Type at least ${min} characters to search.`,
});

/** Role names. */
export const ROLE_WORDS = Object.freeze({
  farmer: 'Farmer',
  buyer: 'Buyer',
  admin: 'Admin',
  superAdmin: 'Main admin',
});

export const DASHBOARD_TEXT = Object.freeze({
  title: 'Dashboard',
  loading: 'Loading the dashboard…',
  errorTitle: 'The dashboard could not be loaded',
  attentionTitle: 'Needs attention',
  nothingNeedsAttention: 'Nothing needs attention.',
  /** @param {number} n */
  ordersNeedReview: (n) => `${plural(n, 'order needs', 'orders need')} review`,
  reviewOrders: 'Review orders',
  /** @param {number} n */
  paymentsWaiting: (n) =>
    `${plural(n, 'payment has', 'payments have')} waited more than 10 minutes for the phone`,
  viewPayments: 'View waiting payments',
  usersTitle: 'Users',
  farmers: 'Farmers',
  buyers: 'Buyers',
  admins: 'Admins',
  disabled: 'Disabled accounts',
  listingsTitle: 'Listings by status',
  ordersTitle: 'Orders by status',
  paymentsTitle: 'Payments by status',
  completedTitle: 'Completed test payments',
  completedNote: 'Test environment amounts. No real money.',
  pipelineTitle: 'Data pipeline health',
  pipelineNote: 'A forecast is current when it is based on the latest published price.',
  pipelineCaption: 'Latest prices and forecasts per market and crop',
  noPriceData: 'No price data yet.',
  market: 'Market',
  crop: 'Crop',
  latestPrice: 'Latest price month',
  latestForecast: 'Latest forecast based on',
  status: 'Status',
  current: 'Current',
  outOfDate: 'Out of date',
  noForecast: 'No forecast yet',
  noPrice: 'No price yet',
  pricesFetched: 'Prices last fetched',
  forecastsGenerated: 'Forecasts last generated',
  never: 'Never',
});

export const USERS_TEXT = Object.freeze({
  title: 'Users',
  description: 'Farmers, buyers and administrators. Disabling an account deletes nothing.',
  loading: 'Loading users…',
  errorTitle: 'Users could not be loaded',
  emptyTitle: 'No users yet',
  emptyFilteredTitle: 'No users match these filters',
  filterLabel: 'Filter users',
  roleLegend: 'Role',
  statusLegend: 'Status',
  searchLabel: 'Search by name or email',
  passwordNote:
    'People reset a forgotten password themselves with "Forgot password" on the sign in page. Administrators cannot set or view passwords.',
  caption: 'Users',
  name: 'Name',
  role: 'Role',
  email: 'Email',
  status: 'Status',
  activity: 'Activity',
  created: 'Created',
  noEmail: 'No email',
  active: 'Active',
  disabledLabel: 'Disabled',
  /** @param {string} when @param {string | null} by */
  disabledSince: (when, by) => (by ? `Since ${when}, by ${by}` : `Since ${when}`),
  /** @param {number} n */
  listings: (n) => plural(n, 'listing', 'listings'),
  /** @param {number} n */
  orders: (n) => plural(n, 'order', 'orders'),
  noActivity: 'Not applicable',
  /** @param {string} by */
  createdBy: (by) => `by ${by}`,
  selfRegistered: 'Registered themselves',
  mustChangePassword: 'Must set a new password',
  disable: 'Disable',
  enable: 'Enable',
  /** @param {string} name */
  disableTitle: (name) => `Disable ${name}?`,
  disableBody:
    'They are signed out on their next request and cannot sign in until you enable the account. Their listings are hidden from buyers. Nothing is deleted.',
  disableConfirm: 'Disable account',
  disabling: 'Disabling…',
  /** @param {string} name */
  enableTitle: (name) => `Enable ${name}?`,
  enableBody: 'They can sign in again with their own password.',
  enableConfirm: 'Enable account',
  enabling: 'Enabling…',
  /** @param {string} name */
  disabledToast: (name) => `${name} is disabled.`,
  /** @param {string} name */
  enabledToast: (name) => `${name} is enabled again.`,
});

export const USER_FILTER_OPTIONS = Object.freeze({
  role: [
    { value: /** @type {const} */ ('all'), label: 'All' },
    { value: /** @type {const} */ ('farmer'), label: 'Farmers' },
    { value: /** @type {const} */ ('buyer'), label: 'Buyers' },
    { value: /** @type {const} */ ('admin'), label: 'Admins' },
  ],
  status: [
    { value: /** @type {const} */ ('all'), label: 'All' },
    { value: /** @type {const} */ ('active'), label: 'Active' },
    { value: /** @type {const} */ ('disabled'), label: 'Disabled' },
  ],
});

export const INVITES_TEXT = Object.freeze({
  title: 'Invites',
  description:
    'Invite a new administrator. They receive an 8 character code by email and choose their own password.',
  loading: 'Loading invitations…',
  errorTitle: 'Invitations could not be loaded',
  emptyTitle: 'No invitations yet',
  emptyFilteredTitle: 'No invitations with this status',
  statusLegend: 'Status',
  caption: 'Invitations',
  send: 'Send invitation',
  formTitle: 'Send an invitation',
  formDescription:
    'Enter their name and email address. They receive an 8 character code by email and choose their own password.',
  nameLabel: 'Full name',
  emailLabel: 'Email',
  emailHint: 'The code is sent to this address.',
  submit: 'Send invitation',
  sending: 'Sending…',
  /** @param {string} email */
  sent: (email) =>
    `Invitation sent to ${email}. The person receives an 8 character code and chooses their own password.`,
  notEmailed:
    'The invitation was created but the email could not be sent. Use Resend, or check email settings.',
  addressLabel: 'Accept invitation page',
  copyAddress: 'Copy address',
  copied: 'Address copied.',
  copyFailed: 'The address could not be copied. Select it and copy it yourself.',
  shareNote: 'Share this address only. The code arrives by email and is never shown here.',
  name: 'Name',
  email: 'Email',
  status: 'Status',
  createdBy: 'Created by',
  created: 'Created',
  expires: 'Expires',
  sendCount: 'Codes sent',
  attempts: 'Wrong codes',
  /** @param {string} when */
  usedAt: (when) => `Used ${when}`,
  /** @param {string} when */
  revokedAt: (when) => `Revoked ${when}`,
  locked: 'Locked after too many wrong codes. Revoke it and send a new invitation.',
  resend: 'Resend',
  resending: 'Sending…',
  /** @param {string} email */
  resent: (email) => `A new code was sent to ${email}.`,
  resentNotEmailed: 'A new code was created but the email could not be sent. Check email settings.',
  revoke: 'Revoke',
  /** @param {string} name */
  revokeTitle: (name) => `Revoke the invitation for ${name}?`,
  revokeBody: 'Their code stops working. You can send a new invitation later.',
  revokeConfirm: 'Revoke invitation',
  revoking: 'Revoking…',
  revoked: 'Invitation revoked.',
  emailCheck: 'Check email delivery',
  emailChecking: 'Sending a test email…',
  emailCheckHint: 'Sends a short test message to your own address. It contains no code.',
  emailCheckOk: 'A test email was sent to your own address.',
  emailCheckNotSent: 'The test email was not sent. Check email settings.',
});

export const INVITE_FILTER_OPTIONS = Object.freeze([
  { value: /** @type {const} */ ('all'), label: 'All' },
  { value: /** @type {const} */ ('pending'), label: 'Pending' },
  { value: /** @type {const} */ ('used'), label: 'Used' },
  { value: /** @type {const} */ ('expired'), label: 'Expired' },
  { value: /** @type {const} */ ('revoked'), label: 'Revoked' },
  { value: /** @type {const} */ ('locked'), label: 'Locked' },
]);

export const LISTINGS_TEXT = Object.freeze({
  title: 'Listings',
  description:
    'Every listing, with its farmer and its orders. Removing a listing hides it from buyers.',
  loading: 'Loading listings…',
  errorTitle: 'Listings could not be loaded',
  emptyTitle: 'No listings yet',
  emptyFilteredTitle: 'No listings match these filters',
  filterLabel: 'Filter listings',
  statusLegend: 'Status',
  cropLegend: 'Crop',
  marketLabel: 'Market',
  allMarkets: 'All markets',
  marketsError: 'Market filter is unavailable right now.',
  searchLabel: 'Search by farmer',
  caption: 'Listings',
  photo: 'Photo',
  produce: 'Produce',
  market: 'Market',
  quantity: 'Quantity',
  price: 'Price',
  status: 'Status',
  farmer: 'Farmer',
  orders: 'Orders',
  farmerDisabled: 'Farmer disabled',
  /** @param {string} crop @param {string} market */
  photoAlt: (crop, market) => `${crop} in ${market}`,
  /** @param {string} amount @param {string} unit */
  perUnit: (amount, unit) => `${amount} per ${unit}`,
  /** @param {number} pending @param {number} paid */
  orderCounts: (pending, paid) => `${pending} waiting for payment, ${paid} paid`,
  /** @param {string} when @param {string | null} by */
  removedBy: (when, by) => (by ? `Removed ${when} by ${by}` : `Removed ${when}`),
  remove: 'Remove',
  removeTitle: 'Remove this listing?',
  removeBody:
    'Buyers can no longer see it. Orders waiting for payment are cancelled and their produce is released. Paid orders are not affected.',
  removeConfirm: 'Remove listing',
  removing: 'Removing…',
  removed: 'Listing removed.',
});

export const ORDERS_TEXT = Object.freeze({
  title: 'Orders',
  description: 'Every order. Orders that need review are waiting for an administrator decision.',
  loading: 'Loading orders…',
  errorTitle: 'Orders could not be loaded',
  emptyTitle: 'No orders yet',
  emptyFilteredTitle: 'No orders match these filters',
  filterLabel: 'Filter orders',
  statusLegend: 'Status',
  searchLabel: 'Search by order reference or buyer name',
  caption: 'Orders',
  reference: 'Reference',
  status: 'Status',
  buyer: 'Buyer',
  seller: 'Seller',
  produce: 'Produce',
  total: 'Total',
  payment: 'Latest payment',
  receipt: 'Receipt',
  created: 'Created',
  noPayment: 'No payment',
  noReceipt: 'No receipt',
  needsReview: 'Needs review',
  /** @param {string} crop @param {string} quantity @param {string} market */
  produceSummary: (crop, quantity, market) => `${crop}, ${quantity} kg, ${market}`,
  /** @param {string} reference */
  openOrder: (reference) => `Order ${reference}`,
});

/** Order status filter: one API status per chip. */
export const ORDER_STATUS_FILTERS = Object.freeze([
  { value: /** @type {const} */ ('all'), label: 'All' },
  { value: /** @type {const} */ ('needs_reconciliation'), label: 'Needs review' },
  { value: /** @type {const} */ ('pending_payment'), label: 'Waiting for payment' },
  { value: /** @type {const} */ ('paid'), label: 'Paid' },
  { value: /** @type {const} */ ('expired'), label: 'Expired' },
  { value: /** @type {const} */ ('cancelled'), label: 'Cancelled' },
  { value: /** @type {const} */ ('payment_failed'), label: 'Failed' },
]);

export const ORDER_DETAIL_TEXT = Object.freeze({
  title: 'Order',
  /** @param {string} reference */
  titleWith: (reference) => `Order ${reference}`,
  back: 'All orders',
  loading: 'Loading the order…',
  errorTitle: 'The order could not be loaded',
  notFound: 'This order could not be found.',
  summaryTitle: 'Summary',
  reference: 'Reference',
  status: 'Status',
  created: 'Created',
  expires: 'Payment window ends',
  produce: 'Produce',
  market: 'Market',
  quantity: 'Quantity',
  unitPrice: 'Price per kg',
  total: 'Total (from the server)',
  latestPayment: 'Latest payment',
  receipt: 'Latest receipt',
  partiesTitle: 'Parties',
  buyer: 'Buyer',
  seller: 'Seller',
  listing: 'Listing ID',
  paymentsTitle: 'Payments',
  paymentsCaption: 'Payments for this order',
  noPayments: 'No payment was started for this order.',
  paymentStatus: 'Status',
  amount: 'Amount',
  entered: 'Number entered',
  target: 'Phone (masked)',
  result: 'Result',
  environment: 'Environment',
  completed: 'Completed',
  callback: 'Callback received',
  /** @param {number | null} code @param {string | null} desc */
  resultText: (code, desc) => {
    if (code === null && !desc) return 'No result yet';
    if (code === null) return /** @type {string} */ (desc);
    return desc ? `${code}: ${desc}` : `Code ${code}`;
  },
  reviewTitle: 'Review needed',
  reviewIntro:
    'Choose what happens to this order. The decision and your note are kept with the order.',
  previousStatus: 'Status before review',
  flaggedAt: 'Flagged',
  confirmSale: 'Confirm sale',
  voidOrder: 'Void order',
  confirmTitle: 'Confirm this sale?',
  voidTitle: 'Void this order?',
  confirmButton: 'Confirm sale',
  voidButton: 'Void order',
  resolving: 'Saving…',
  noteLabel: 'Note',
  noteHint: 'This note is kept with the order.',
  refreshOrder: 'Refresh order',
  confirmedToast: 'Sale confirmed.',
  voidedToast: 'Order voided.',
  resolutionTitle: 'Resolution',
  resolutionAction: 'Decision',
  resolutionNote: 'Note',
  resolutionBy: 'By',
  resolutionAt: 'When',
  noNote: 'No note',
  notRecorded: 'Not recorded',
  unknownAdmin: 'Unknown administrator',
});

/** The resolution actions as words. @type {Readonly<Record<string, string>>} */
export const RESOLUTION_WORDS = Object.freeze({
  confirm_sale: 'Sale confirmed',
  void_order: 'Order voided',
});

/** Shortest and longest review note (the server allows at most 500 characters). */
export const NOTE_MIN = 10;
export const NOTE_MAX = 500;

export const NOTE_TEXT = Object.freeze({
  /** @param {number} n @param {number} max */
  counter: (n, max) => `${n} of ${max} characters`,
  /** @param {number} min */
  tooShort: (min) => `Write at least ${min} characters.`,
  /** @param {number} max */
  tooLong: (max) => `Use at most ${max} characters.`,
});

export const PAYMENTS_TEXT = Object.freeze({
  title: 'Payments',
  description: 'M-Pesa payment requests and their results.',
  loading: 'Loading payments…',
  errorTitle: 'Payments could not be loaded',
  emptyTitle: 'No payments yet',
  emptyFilteredTitle: 'No payments match these filters',
  filterLabel: 'Filter payments',
  statusLegend: 'Status',
  environmentLabel: 'Environment',
  allEnvironments: 'All environments',
  sandbox: 'Sandbox (test)',
  production: 'Production',
  referenceLabel: 'Order reference',
  referenceShort: 'Type at least 6 characters of the order reference.',
  fromLabel: 'Created from',
  toLabel: 'Created to',
  datesNote: 'Dates as interpreted by the server (whole days).',
  caption: 'Payments',
  order: 'Order',
  buyer: 'Buyer',
  amount: 'Amount',
  status: 'Status',
  entered: 'Number entered',
  notRecorded: 'Not recorded',
  target: 'Phone (masked)',
  receipt: 'Receipt',
  result: 'Result',
  environment: 'Environment',
  attempt: 'Attempt',
  created: 'Created',
  completed: 'Completed',
  noResult: 'No result yet',
});

export const PAYMENT_STATUS_FILTERS = Object.freeze([
  { value: /** @type {const} */ ('all'), label: 'All' },
  { value: /** @type {const} */ ('initiated'), label: 'Initiated' },
  { value: /** @type {const} */ ('completed'), label: 'Completed' },
  { value: /** @type {const} */ ('failed'), label: 'Failed' },
  { value: /** @type {const} */ ('cancelled'), label: 'Cancelled' },
  { value: /** @type {const} */ ('timeout'), label: 'Timeout' },
]);

export const EVENTS_TEXT = Object.freeze({
  title: 'Payment events',
  description: 'What the payment service sent and received, oldest first. Shown as plain text.',
  loading: 'Loading events…',
  errorTitle: 'The events could not be loaded',
  empty: 'No events were recorded for this payment.',
  type: 'Event',
  time: 'Time',
  checkoutId: 'Checkout request ID',
  noCheckoutId: 'None',
  payload: 'Payload',
  close: 'Close',
});

export const PAYLOAD_TEXT = Object.freeze({
  showAll: 'Show all',
  /** @param {string} size */
  truncated: (size) => `Shortened: the full payload is ${size}.`,
  copy: 'Copy payload',
  copied: 'Payload copied.',
  copyFailed: 'The payload could not be copied.',
  unreadable: 'The payload could not be shown.',
});

export const ACCURACY_TEXT = Object.freeze({
  title: 'Forecast accuracy',
  description:
    'Forecasts compared with the prices that were later published. Pending forecasts wait for that price.',
  loading: 'Loading forecast accuracy…',
  errorTitle: 'Forecast accuracy could not be loaded',
  emptyTitle: 'No forecasts to compare yet',
  emptyFilteredTitle: 'No forecasts match these filters',
  filterLabel: 'Filter forecasts',
  marketLabel: 'Market',
  allMarkets: 'All markets',
  marketsError: 'Market filter is unavailable right now.',
  cropLegend: 'Crop',
  horizonLegend: 'Horizon',
  sourceLegend: 'Source',
  includePending: 'Include pending',
  summaryTitle: 'Summary',
  /** @param {string} horizon @param {boolean} backfill */
  summaryHeading: (horizon, backfill) =>
    `${horizon} ahead, ${backfill ? 'backfilled' : 'live'} forecasts`,
  realised: 'Compared',
  pending: 'Pending',
  mape: 'Average percentage error (MAPE)',
  meanAbsError: 'Average error (KES per kg)',
  directional: 'Direction correct',
  beatPersistence: 'Beat "the price stays the same"',
  whatTheseMean: 'What these mean',
  explanations: [
    'Compared: forecasts whose target month price has been published. Pending: forecasts still waiting for it.',
    'Average percentage error (MAPE): how far the forecast price was from the published price, as a share of the published price.',
    'Average error: the same distance in shillings per kg.',
    'Direction correct: how often the forecast got the direction of the change (up or down) right.',
    'Beat "the price stays the same": how often the forecast was closer than simply assuming the latest price would not change.',
    'Backfilled forecasts were computed afterwards from the prices available at the time. They were never shown to farmers live.',
    'The samples are small, so these figures are indicative only.',
  ],
  noteLabel: 'Note from the server',
  caption: 'Forecasts and outcomes',
  market: 'Market',
  crop: 'Crop',
  horizon: 'Horizon',
  originMonth: 'Based on',
  targetMonth: 'For',
  originPrice: 'Price at the time',
  predicted: 'Forecast price',
  actual: 'Published price',
  pctError: 'Error',
  direction: 'Direction correct',
  beat: 'Beat persistence',
  source: 'Source',
  live: 'Live',
  backfill: 'Backfill',
  pendingValue: 'Pending',
  yes: 'Yes',
  no: 'No',
  notAvailable: 'Not available',
});

export const ACCURACY_FILTER_OPTIONS = Object.freeze({
  crop: [
    { value: /** @type {const} */ ('all'), label: 'All' },
    { value: /** @type {const} */ ('maize'), label: 'Maize' },
    { value: /** @type {const} */ ('beans'), label: 'Beans' },
  ],
  horizon: [
    { value: /** @type {const} */ ('all'), label: 'All' },
    { value: /** @type {const} */ ('one_month'), label: '1 month' },
    { value: /** @type {const} */ ('two_month'), label: '2 months' },
  ],
  source: [
    { value: /** @type {const} */ ('all'), label: 'All' },
    { value: /** @type {const} */ ('live'), label: 'Live' },
    { value: /** @type {const} */ ('backfill'), label: 'Backfill' },
  ],
});

export const LISTING_FILTER_OPTIONS = Object.freeze({
  status: [
    { value: /** @type {const} */ ('all'), label: 'All' },
    { value: /** @type {const} */ ('active'), label: 'Active' },
    { value: /** @type {const} */ ('sold_out'), label: 'Sold out' },
    { value: /** @type {const} */ ('removed'), label: 'Removed' },
  ],
  crop: ACCURACY_FILTER_OPTIONS.crop,
});
