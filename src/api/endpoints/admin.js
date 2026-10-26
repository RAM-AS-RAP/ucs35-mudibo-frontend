/**
 * Administrator endpoints (F4). Every /admin route needs the admin role; the invite routes and
 * the email check also need the main administrator (is_super_admin). The server checks both on
 * every request; the UI only hides what a session cannot use.
 *
 * openapi.json names several admin fields without types (AdminListingOut, AdminOrderOut,
 * AdminOrderDetail, AccuracyItemOut, AccuracySummaryOut), so the shapes are described here.
 * Money is a JSON number with 2 decimals (payment amounts and the completed test total are whole
 * shillings). Show every amount, count and accuracy figure as returned; never recompute one.
 */
import { api, unwrap } from '../client';

/** @typedef {import('../schema').components['schemas']} Schemas */
/** @typedef {Schemas['UserRole']} UserRole */
/** @typedef {Schemas['InviteStatus']} InviteStatus */
/** @typedef {Schemas['ListingStatus']} ListingStatus */
/** @typedef {Schemas['OrderStatus']} OrderStatus */
/** @typedef {Schemas['PaymentStatus']} PaymentStatus */
/** @typedef {Schemas['CropType']} CropType */
/** @typedef {Schemas['ForecastHorizon']} ForecastHorizon */
/** @typedef {Schemas['ResolveAction']} ResolveAction */
/** @typedef {Schemas['StatsOut']} AdminStats */
/** @typedef {Schemas['UserAdminOut']} AdminUser */
/** @typedef {Schemas['UserAdminPage']} AdminUserPage */
/** @typedef {Schemas['InviteOut']} Invite */
/** @typedef {Schemas['InvitePage']} InvitePage */
/** @typedef {Schemas['InviteSentOut']} InviteSent */
/** @typedef {Schemas['EmailCheckOut']} EmailCheck */
/** @typedef {Schemas['AdminPaymentOut']} AdminPayment */
/** @typedef {Schemas['AdminPaymentPage']} AdminPaymentPage */
/** @typedef {Schemas['AdminOrderPaymentOut']} AdminOrderPayment */
/** @typedef {Schemas['PaymentEventList']} PaymentEventList */
/** @typedef {Schemas['PaymentEventOut']} PaymentEvent */
/** @typedef {Schemas['ReconciliationOut']} Reconciliation */
/** @typedef {Schemas['ResolutionOut']} Resolution */

/** 'sandbox' or 'production' (the environment filter of GET /admin/payments). */
/** @typedef {'sandbox' | 'production'} PaymentEnvironment */

/**
 * A listing as the administrator sees it (AdminListingOut).
 * @typedef {object} AdminListing
 * @property {string} id
 * @property {string} farmer_id
 * @property {string} farmer_name
 * @property {boolean} farmer_disabled
 * @property {CropType} crop
 * @property {string} market
 * @property {number} quantity_available
 * @property {string} unit
 * @property {number} price_per_unit
 * @property {string | null} image_url
 * @property {ListingStatus} status
 * @property {string | null} removed_at
 * @property {string | null} removed_by_name
 * @property {number} pending_orders
 * @property {number} paid_orders
 * @property {string} created_at
 */

/** @typedef {{ items: AdminListing[], total: number, limit: number, offset: number }} AdminListingPage */

/**
 * An order as the administrator sees it (AdminOrderOut). `reconciliation` is set only for
 * needs_reconciliation orders, `resolution` once an administrator resolved one.
 * @typedef {object} AdminOrder
 * @property {string} id
 * @property {string} reference
 * @property {OrderStatus} status
 * @property {string} buyer_name
 * @property {string} seller_name
 * @property {string} listing_id
 * @property {CropType} crop
 * @property {string} market
 * @property {number} quantity
 * @property {number} unit_price
 * @property {number} total_amount
 * @property {string} created_at
 * @property {string} expires_at
 * @property {PaymentStatus | null} latest_payment_status
 * @property {string | null} latest_mpesa_receipt_number
 * @property {Reconciliation | null} [reconciliation]
 * @property {Resolution | null} [resolution]
 */

/** @typedef {{ items: AdminOrder[], total: number, limit: number, offset: number }} AdminOrderPage */

/** @typedef {AdminOrder & { payments: AdminOrderPayment[] }} AdminOrderDetail */

/**
 * One forecast checked against the price that was later published (AccuracyItemOut).
 * Computed values are null while the forecast is pending.
 * @typedef {object} AccuracyItem
 * @property {string} market
 * @property {CropType} crop
 * @property {ForecastHorizon} horizon
 * @property {string} origin_month
 * @property {string} target_month
 * @property {number | null} origin_price
 * @property {number | null} predicted_price
 * @property {number | null} actual_price
 * @property {number | null} abs_error
 * @property {number | null} pct_error
 * @property {number | null} actual_log_change
 * @property {boolean | null} direction_correct
 * @property {number | null} persistence_abs_error
 * @property {boolean | null} beat_persistence
 * @property {boolean} is_backfill
 * @property {boolean} is_pending
 */

/**
 * Summary per horizon and source (AccuracySummaryOut).
 * @typedef {object} AccuracySummary
 * @property {ForecastHorizon} horizon
 * @property {boolean} is_backfill
 * @property {number} n_realised
 * @property {number} n_pending
 * @property {number | null} mape
 * @property {number | null} mean_abs_error
 * @property {number | null} directional_accuracy
 * @property {number | null} beat_persistence_rate
 */

/**
 * @typedef {object} AccuracyPage
 * @property {AccuracyItem[]} items
 * @property {number} total
 * @property {number} limit
 * @property {number} offset
 * @property {AccuracySummary[]} summary
 * @property {string} note
 */

/** @typedef {{ limit?: number, offset?: number }} Paging */

/**
 * The query object without empty values (null, undefined or '').
 * @param {Record<string, unknown>} values
 */
function compact(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  );
}

/**
 * A date as YYYY-MM-DD: a Date in UTC, or a string already in that form (null otherwise).
 * @param {string | Date | null | undefined} value
 * @returns {string | null}
 */
export function toApiDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/* Dashboard */

/**
 * GET /api/v1/admin/stats: counts per role and status, the completed test payment total, what
 * needs attention, and the price and forecast pipeline per market and crop.
 * @returns {Promise<AdminStats>}
 */
export function getAdminStats() {
  return unwrap(api.GET('/api/v1/admin/stats'));
}

/* Users */

/**
 * GET /api/v1/admin/users. `q` searches names and emails (2 to 50 characters).
 * @param {{ role?: UserRole | null, isDisabled?: boolean | null, q?: string | null } & Paging} [params]
 * @returns {Promise<AdminUserPage>}
 */
export function getAdminUsers({ role, isDisabled, q, limit, offset } = {}) {
  const query = compact({ role, is_disabled: isDisabled, q, limit, offset });
  return unwrap(api.GET('/api/v1/admin/users', { params: { query } }));
}

/**
 * PATCH /api/v1/admin/users/{user_id}/disable with an empty body: 200 with the user, also when
 * already disabled. 403 cannot_modify_super_admin, cannot_disable_self, forbidden; 404
 * user_not_found.
 * @param {string} userId
 * @returns {Promise<AdminUser>}
 */
export function disableUser(userId) {
  return unwrap(
    api.PATCH('/api/v1/admin/users/{user_id}/disable', {
      params: { path: { user_id: userId } },
    }),
  );
}

/**
 * PATCH /api/v1/admin/users/{user_id}/enable with an empty body: 200 with the user, also when
 * already enabled. Same errors as disableUser.
 * @param {string} userId
 * @returns {Promise<AdminUser>}
 */
export function enableUser(userId) {
  return unwrap(
    api.PATCH('/api/v1/admin/users/{user_id}/enable', {
      params: { path: { user_id: userId } },
    }),
  );
}

/* Invites (main administrator) */

/**
 * GET /api/v1/admin/invites. Only masked emails; never a code.
 * @param {{ status?: InviteStatus | null } & Paging} [params]
 * @returns {Promise<InvitePage>}
 */
export function getInvites({ status, limit, offset } = {}) {
  const query = compact({ status, limit, offset });
  return unwrap(api.GET('/api/v1/admin/invites', { params: { query } }));
}

/**
 * POST /api/v1/admin/invites with exactly `{name, email}`: 201 with the masked email and
 * `email_sent`. 409 user_exists, too_many_pending_invites; 422; 429.
 * @param {{ name: string, email: string }} invite
 * @returns {Promise<InviteSent>}
 */
export function createInvite({ name, email }) {
  return unwrap(api.POST('/api/v1/admin/invites', { body: { name, email } }));
}

/**
 * POST /api/v1/admin/invites/{invite_id}/resend with an empty body: a new code by email.
 * 409 invite_not_pending, send_limit_reached; 429 resend_cooldown with Retry-After.
 * @param {string} inviteId
 * @returns {Promise<InviteSent>}
 */
export function resendInvite(inviteId) {
  return unwrap(
    api.POST('/api/v1/admin/invites/{invite_id}/resend', {
      params: { path: { invite_id: inviteId } },
    }),
  );
}

/**
 * DELETE /api/v1/admin/invites/{invite_id}: 204, also when already revoked. 409
 * invite_not_pending for a used invitation.
 * @param {string} inviteId
 * @returns {Promise<void>}
 */
export async function revokeInvite(inviteId) {
  await unwrap(
    api.DELETE('/api/v1/admin/invites/{invite_id}', {
      params: { path: { invite_id: inviteId } },
    }),
  );
}

/**
 * POST /api/v1/admin/email/test with an empty body: a short message to the acting main
 * administrator's own address. 502 email_failed carries `category` in the error object
 * (ApiError.extra.category).
 * @returns {Promise<EmailCheck>}
 */
export function sendTestEmail() {
  return unwrap(api.POST('/api/v1/admin/email/test'));
}

/* Listing moderation */

/**
 * GET /api/v1/admin/listings. `q` is a text search (2 to 50 characters).
 * @param {{ status?: ListingStatus | null, crop?: CropType | null, market?: string | null, farmerId?: string | null, q?: string | null } & Paging} [params]
 * @returns {Promise<AdminListingPage>}
 */
export async function getAdminListings({ status, crop, market, farmerId, q, limit, offset } = {}) {
  const query = compact({ status, crop, market, farmer_id: farmerId, q, limit, offset });
  const page = await unwrap(api.GET('/api/v1/admin/listings', { params: { query } }));
  return /** @type {AdminListingPage} */ (/** @type {unknown} */ (page));
}

/**
 * DELETE /api/v1/admin/listings/{listing_id}: 204, also when already removed. Cancels the
 * unpaid orders and releases their produce. 409 listing_has_open_payments; 404 listing_not_found.
 * @param {string} listingId
 * @returns {Promise<void>}
 */
export async function removeListingAsAdmin(listingId) {
  await unwrap(
    api.DELETE('/api/v1/admin/listings/{listing_id}', {
      params: { path: { listing_id: listingId } },
    }),
  );
}

/* Orders and reconciliation */

/**
 * GET /api/v1/admin/orders. `status` takes one order status; `q` is a reference prefix or a
 * buyer name (2 to 50 characters).
 * @param {{ status?: OrderStatus | null, q?: string | null } & Paging} [params]
 * @returns {Promise<AdminOrderPage>}
 */
export async function getAdminOrders({ status, q, limit, offset } = {}) {
  const query = compact({ status, q, limit, offset });
  const page = await unwrap(api.GET('/api/v1/admin/orders', { params: { query } }));
  return /** @type {AdminOrderPage} */ (/** @type {unknown} */ (page));
}

/**
 * GET /api/v1/admin/orders/{order_id}: the order with every payment. 404 order_not_found.
 * @param {string} orderId
 * @returns {Promise<AdminOrderDetail>}
 */
export async function getAdminOrder(orderId) {
  const order = await unwrap(
    api.GET('/api/v1/admin/orders/{order_id}', { params: { path: { order_id: orderId } } }),
  );
  return /** @type {AdminOrderDetail} */ (/** @type {unknown} */ (order));
}

/**
 * POST /api/v1/admin/orders/{order_id}/resolve with exactly `{action, note}`. 200 with the order
 * and its `resolution`. 409 order_not_in_reconciliation, reconciliation_context_missing,
 * insufficient_stock_to_confirm; 422.
 * @param {string} orderId
 * @param {{ action: ResolveAction, note: string }} resolution
 * @returns {Promise<AdminOrderDetail>}
 */
export async function resolveOrder(orderId, { action, note }) {
  const order = await unwrap(
    api.POST('/api/v1/admin/orders/{order_id}/resolve', {
      params: { path: { order_id: orderId } },
      body: { action, note },
    }),
  );
  return /** @type {AdminOrderDetail} */ (/** @type {unknown} */ (order));
}

/* Payments */

/**
 * GET /api/v1/admin/payments. Dates are sent as YYYY-MM-DD.
 * @param {{ status?: PaymentStatus | null, orderReference?: string | null, environment?: PaymentEnvironment | null, createdFrom?: string | Date | null, createdTo?: string | Date | null } & Paging} [params]
 * @returns {Promise<AdminPaymentPage>}
 */
export function getAdminPayments({
  status,
  orderReference,
  environment,
  createdFrom,
  createdTo,
  limit,
  offset,
} = {}) {
  const query = compact({
    status,
    order_reference: orderReference,
    environment,
    created_from: toApiDate(createdFrom),
    created_to: toApiDate(createdTo),
    limit,
    offset,
  });
  return unwrap(api.GET('/api/v1/admin/payments', { params: { query } }));
}

/**
 * GET /api/v1/admin/payments/{payment_id}/events: up to 100 events, oldest first. Payloads were
 * redacted when stored but are untrusted text: show them as escaped text only.
 * 404 payment_not_found.
 * @param {string} paymentId
 * @returns {Promise<PaymentEventList>}
 */
export function getPaymentEvents(paymentId) {
  return unwrap(
    api.GET('/api/v1/admin/payments/{payment_id}/events', {
      params: { path: { payment_id: paymentId } },
    }),
  );
}

/* Forecast accuracy */

/**
 * GET /api/v1/admin/forecast-accuracy. `isBackfill` null means both sources; `includePending`
 * is always sent (the server's default is true).
 * @param {{ market?: string | null, crop?: CropType | null, horizon?: ForecastHorizon | null, isBackfill?: boolean | null, includePending?: boolean } & Paging} [params]
 * @returns {Promise<AccuracyPage>}
 */
export async function getForecastAccuracy({
  market,
  crop,
  horizon,
  isBackfill,
  includePending = true,
  limit,
  offset,
} = {}) {
  const query = compact({
    market,
    crop,
    horizon,
    is_backfill: isBackfill,
    include_pending: includePending,
    limit,
    offset,
  });
  const page = await unwrap(api.GET('/api/v1/admin/forecast-accuracy', { params: { query } }));
  return /** @type {AccuracyPage} */ (/** @type {unknown} */ (page));
}
