/**
 * API errors and user facing messages.
 *
 * Every failed call becomes an ApiError. Screens branch on `code` (never on `message`)
 * and show getUserMessage(error). The message table mirrors the "Suggested user messages"
 * table in docs/backend/frontend_contract.md; a test fails if a documented code is missing.
 */
import { formatWait, waitSecondsFrom } from '@/lib/waitTime';

export class ApiError extends Error {
  /**
   * @param {object} init
   * @param {number} init.status  HTTP status, or 0 for network failures and timeouts
   * @param {string} init.code
   * @param {string} [init.message]  server message (do not branch on it)
   * @param {string | null} [init.reason]
   * @param {string | null} [init.requestId]
   * @param {number | null} [init.retryAfter]  seconds
   * @param {string[] | null} [init.fields]
   * @param {Array<{field: string, message: string}> | null} [init.details]
   * @param {Record<string, unknown>} [init.extra]  other documented fields (existing_order_id, category)
   */
  constructor({ status, code, message, reason, requestId, retryAfter, fields, details, extra }) {
    super(message || code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.reason = reason ?? null;
    this.requestId = requestId ?? null;
    this.retryAfter = retryAfter ?? null;
    this.fields = fields ?? null;
    this.details = details ?? null;
    this.extra = extra ?? {};
  }
}

/**
 * Parse a Retry-After header: delta seconds or an HTTP date.
 * @param {string | null} value
 * @returns {number | null}
 */
export function parseRetryAfter(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

/**
 * Build an ApiError from an error response and its parsed body.
 * @param {Response} response
 * @param {unknown} body  parsed JSON, or null when the body was not JSON
 */
export function apiErrorFromResponse(response, body) {
  const envelope =
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object'
      ? /** @type {Record<string, unknown>} */ (body.error)
      : {};
  const str = (/** @type {unknown} */ v) => (typeof v === 'string' && v ? v : null);
  const { code, message, reason, request_id: bodyRequestId, fields, details, ...extra } = envelope;
  return new ApiError({
    status: response.status,
    code: str(code) ?? 'http_error',
    message: str(message) ?? `Request failed with status ${response.status}`,
    reason: str(reason),
    requestId: str(bodyRequestId) ?? response.headers.get('X-Request-ID'),
    retryAfter: parseRetryAfter(response.headers.get('Retry-After')),
    fields: Array.isArray(fields) ? fields.map(String) : null,
    details: Array.isArray(details) ? details : null,
    extra,
  });
}

export const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Code to message, from docs/backend/frontend_contract.md. The listing codes use the wording
 * of the F2b task, which names the farmer's next step; the order and payment codes use the
 * wording of the F3 task, which names the buyer's next step.
 */
export const ERROR_MESSAGES = Object.freeze({
  invalid_credentials: 'Incorrect email or password.',
  challenge_closed: 'Your sign in session ended. Please start again.',
  too_many_login_codes: 'Too many sign in codes were requested. Try again later.',
  password_change_required: 'Please set a new password to continue.',
  forbidden: "You don't have access to this page.",
  wrong_current_password: 'Your current password is incorrect.',
  password_too_weak: 'Choose a stronger password.',
  conflict: 'An account with this email already exists.',
  validation_error: 'Please check the highlighted fields.',
  body_not_allowed: GENERIC_MESSAGE,
  not_found: 'This page is not available.',
  method_not_allowed: 'This page is not available.',
  payload_too_large: 'The upload is too large.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  internal_error: 'Something went wrong on our side. Please try again.',
  service_unavailable: 'The service is temporarily unavailable. Please try again shortly.',
  busy: 'The service is busy. Please try again shortly.',
  not_implemented: 'This feature is not available yet.',
  market_not_available: 'No price data for this market yet.',
  forecast_unavailable: 'Forecast not available yet for this market and crop.',
  listing_not_found: 'This listing could not be found.',
  listing_limit_reached:
    'You already have 50 active listings. Remove or sell one before adding another.',
  listing_removed: 'This listing was removed and can no longer be changed.',
  listing_has_pending_orders:
    'A buyer has started paying for this listing. Try again in a few minutes.',
  no_changes: 'Nothing was changed.',
  invalid_image: 'That photo could not be used. Choose a JPEG or PNG photo.',
  image_too_large: 'That photo is too large.',
  listing_unavailable: 'This listing is no longer available.',
  insufficient_stock: 'There is not enough produce left. Choose a smaller quantity.',
  order_too_small: 'The total is below the minimum order of KES 10.',
  pending_order_exists: 'You already have an order waiting for payment for this listing.',
  too_many_pending_orders: 'You have 3 orders waiting for payment. Pay for or cancel one first.',
  order_not_found: 'This order could not be found.',
  order_not_cancellable: 'This order can no longer be cancelled.',
  order_not_payable: 'This order can no longer be paid.',
  order_expiring: 'This order is about to expire. Please place a new order.',
  payment_in_progress: 'A payment is already in progress. Check your phone.',
  max_attempts_reached:
    'You have tried to pay for this order 3 times. Cancel it and start a new order.',
  idempotency_key_required: GENERIC_MESSAGE,
  invalid_idempotency_key: GENERIC_MESSAGE,
  too_many_payment_attempts:
    'Too many payment attempts for this phone number. Please try again later.',
  too_many_buyer_payment_attempts:
    'You have made too many payment attempts. Please try again later.',
  too_many_phone_numbers:
    'You have used too many different phone numbers today. Use a number you already used, or try again later.',
  invalid_phone: 'Enter a valid Safaricom number, for example 0712 345 678.',
  phone_required: 'Enter the M-Pesa number to send the payment prompt to.',
  idempotency_key_reused:
    'This request was already used with a different number. Start a new payment attempt.',
  payment_request_failed: 'Could not start the M-Pesa prompt. Please try again.',
  payments_unavailable: 'Payments are temporarily unavailable. Please try again soon.',
  invalid_or_expired_code: 'The code is invalid or has expired.',
  codes_unavailable: 'This feature is temporarily unavailable.',
  user_exists: 'An account with this email already exists.',
  too_many_pending_invites: 'Too many open invitations. Revoke one first.',
  invite_conflict: 'An invitation for this person was just created. Refresh the list.',
  invite_not_found: 'Invitation not found.',
  invite_not_pending: 'This invitation is no longer open.',
  send_limit_reached: 'You have used all the code resends. Please start again.',
  resend_cooldown: 'Please wait before asking for another code.',
  no_email: 'Your account has no email address.',
  email_failed: 'The email could not be sent.',
  user_not_found: 'User not found.',
  cannot_disable_self: "You can't disable your own account.",
  cannot_modify_super_admin: "The super administrator can't be changed.",
  order_not_in_reconciliation: 'This order no longer needs review.',
  reconciliation_context_missing:
    "This order can't be resolved automatically; check the payment events.",
  insufficient_stock_to_confirm: 'Not enough stock is left to confirm this sale.',
  listing_has_open_payments:
    'A buyer is paying for this listing right now. Try again in a few minutes.',
  payment_not_found: 'Payment not found.',
  // Google sign in (identity v2, prompt 6). The wording of the prompt 6 task, which names the
  // next step in this app (the contract's password_not_set text points to Forgot password).
  google_unavailable: 'Google sign in is not available right now. Use your email and password.',
  google_sign_in_failed:
    'Google sign in did not work. Please try again or use your email and password.',
  google_not_allowed: 'Administrator accounts sign in with email and password.',
  google_conflict:
    'A different Google account is already connected to this email. Use that Google account, or sign in with your email and password.',
  google_retry: 'Please try signing in with Google again.',
  invalid_or_expired_ticket: 'Your Google sign in expired. Please try again.',
  password_not_set: 'You have not set a password yet. Set one from Sign-in methods.',
  // Client side codes (no HTTP response).
  network_error: "Can't reach AgriSence. Check your internet connection and try again.",
  timeout: 'The request took too long. Check your connection and try again.',
  // The code step lost its in memory flow (a reload): the person starts again.
  flow_lost: 'Your sign in was interrupted. Please start again.',
  // A response that does not match the documented shape.
  unexpected_response: GENERIC_MESSAGE,
});

/**
 * Plain English message for an error. Unknown codes and non API errors get the generic message.
 * @param {unknown} error
 * @returns {string}
 */
export function getUserMessage(error) {
  if (!(error instanceof ApiError)) return GENERIC_MESSAGE;
  const { code, retryAfter, reason } = error;

  if (code === 'rate_limited' && retryAfter) {
    return `Too many attempts. Please wait ${formatWait(retryAfter)} and try again.`;
  }
  if (code === 'too_many_login_codes') {
    return `Too many sign in codes were requested. Try again in ${formatWait(waitSecondsFrom(retryAfter))}.`;
  }
  /** @type {string | undefined} */
  const base = Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code)
    ? ERROR_MESSAGES[/** @type {keyof typeof ERROR_MESSAGES} */ (code)]
    : undefined;
  if (!base) return GENERIC_MESSAGE;
  if (code === 'password_too_weak' && reason) return `${base} ${reason}`;
  if (code === 'email_failed' && typeof error.extra.category === 'string') {
    return `${base} (${error.extra.category})`;
  }
  return base;
}

/**
 * Message plus detail lines for an error dialog or ErrorState.
 * The request id is shown as a "Reference" line so users can quote it to support.
 * @param {unknown} error
 * @returns {{ message: string, details: string[], reference: string | null }}
 */
export function getUserMessageDetails(error) {
  const message = getUserMessage(error);
  const reference = error instanceof ApiError ? error.requestId : null;
  return { message, reference, details: reference ? [`Reference: ${reference}`] : [] };
}
