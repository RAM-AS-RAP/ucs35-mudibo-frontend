import { api, unwrap } from '../client';
import { normalizeCode } from '@/lib/codes';

/**
 * Authentication endpoints (identity v2: email only accounts with one time codes).
 * Every request body is built from named fields only, with exactly the keys of the OpenAPI
 * schema: the backend rejects unknown fields with 422, and `role` (taken from the route) or any
 * other key can never be sent. Codes are normalised (upper case, no spaces or hyphens) first.
 * Passwords, codes and tokens exist only in the arguments and the request body.
 */

/** @typedef {import('../schema').components['schemas']} Schemas */
/** @typedef {Schemas['AuthResult']} AuthResult */
/** @typedef {Schemas['UserOut']} UserOut */
/** @typedef {Schemas['RegisterRequest']} RegisterRequest */
/** @typedef {Schemas['RegistrationAccepted']} RegistrationAccepted */
/** @typedef {Schemas['ResendAccepted']} ResendAccepted */
/** @typedef {Schemas['LoginResendOut']} LoginResendOut */
/** @typedef {Schemas['PasswordChangedResponse']} PasswordChangedResponse */
/** @typedef {Schemas['AcceptedOut']} AcceptedOut */

/**
 * The registration body: exactly `{name, email, password}`.
 * @param {{ name: string, email: string, password: string }} fields
 * @returns {RegisterRequest}
 */
export function buildRegisterBody({ name, email, password }) {
  return { name: name.trim(), email: email.trim(), password };
}

/**
 * POST /api/v1/auth/login (public). 200 AuthResult: `signed_in` or `code_required`.
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<AuthResult>}
 */
export function login({ email, password }) {
  return unwrap(api.POST('/api/v1/auth/login', { body: { email: email.trim(), password } }));
}

/**
 * POST /api/v1/auth/login/verify (public). 200 AuthResult (`signed_in`).
 * @param {{ challengeToken: string, code: string }} params
 * @returns {Promise<AuthResult>}
 */
export function verifyLogin({ challengeToken, code }) {
  return unwrap(
    api.POST('/api/v1/auth/login/verify', {
      body: { challenge_token: challengeToken, code: normalizeCode(code) },
    }),
  );
}

/**
 * POST /api/v1/auth/login/resend (public). 200 `{code_sent, resend_available_in, code_expires_at}`.
 * @param {{ challengeToken: string }} params
 * @returns {Promise<LoginResendOut>}
 */
export function resendLoginCode({ challengeToken }) {
  return unwrap(
    api.POST('/api/v1/auth/login/resend', { body: { challenge_token: challengeToken } }),
  );
}

/**
 * POST /api/v1/auth/register/farmer (public). Always 202 with the same shape, whether or not
 * the email already has an account.
 * @param {{ name: string, email: string, password: string }} fields
 * @returns {Promise<RegistrationAccepted>}
 */
export function registerFarmer(fields) {
  return unwrap(api.POST('/api/v1/auth/register/farmer', { body: buildRegisterBody(fields) }));
}

/**
 * POST /api/v1/auth/register/buyer (public). Always 202 (see registerFarmer).
 * @param {{ name: string, email: string, password: string }} fields
 * @returns {Promise<RegistrationAccepted>}
 */
export function registerBuyer(fields) {
  return unwrap(api.POST('/api/v1/auth/register/buyer', { body: buildRegisterBody(fields) }));
}

/**
 * POST /api/v1/auth/register/verify (public). 201 AuthResult (`signed_in`).
 * @param {{ registrationToken: string, code: string }} params
 * @returns {Promise<AuthResult>}
 */
export function verifyRegistration({ registrationToken, code }) {
  return unwrap(
    api.POST('/api/v1/auth/register/verify', {
      body: { registration_token: registrationToken, code: normalizeCode(code) },
    }),
  );
}

/**
 * POST /api/v1/auth/register/resend (public). Always 202 `{message, resend_available_in}`.
 * @param {{ registrationToken: string }} params
 * @returns {Promise<ResendAccepted>}
 */
export function resendRegistrationCode({ registrationToken }) {
  return unwrap(
    api.POST('/api/v1/auth/register/resend', {
      body: { registration_token: registrationToken },
    }),
  );
}

/**
 * GET /api/v1/auth/me (token). `{id, name, email, role, is_super_admin, must_change_password,
 * password_set, google_linked, created_at}`. `password_set` is false only for an account created
 * with Google that has no password yet.
 * @returns {Promise<UserOut>}
 */
export function getMe() {
  return unwrap(api.GET('/api/v1/auth/me'));
}

/**
 * POST /api/v1/auth/change-password (token). Returns 200 with `login_required: true`:
 * every earlier token, including the current one, is revoked.
 * @param {{ currentPassword: string, newPassword: string }} passwords
 * @returns {Promise<PasswordChangedResponse>}
 */
export function changePassword({ currentPassword, newPassword }) {
  return unwrap(
    api.POST('/api/v1/auth/change-password', {
      body: { current_password: currentPassword, new_password: newPassword },
    }),
  );
}

/**
 * POST /api/v1/auth/password-reset/request (public). Always 202 with the same message.
 * @param {{ email: string }} params
 * @returns {Promise<AcceptedOut>}
 */
export function requestPasswordReset({ email }) {
  return unwrap(api.POST('/api/v1/auth/password-reset/request', { body: { email: email.trim() } }));
}

/**
 * POST /api/v1/auth/password-reset/confirm (public). 204 on success.
 * @param {{ email: string, code: string, newPassword: string }} params
 * @returns {Promise<void>}
 */
export async function confirmPasswordReset({ email, code, newPassword }) {
  await unwrap(
    api.POST('/api/v1/auth/password-reset/confirm', {
      body: { email: email.trim(), code: normalizeCode(code), new_password: newPassword },
    }),
  );
}

/**
 * POST /api/v1/auth/accept-invite (public). 201 AuthResult: the new admin is signed in directly
 * (the invite code proved the email), so `login` is never called afterwards.
 * @param {{ email: string, code: string, password: string }} params
 * @returns {Promise<AuthResult>}
 */
export function acceptInvite({ email, code, password }) {
  return unwrap(
    api.POST('/api/v1/auth/accept-invite', {
      body: { email: email.trim(), code: normalizeCode(code), password },
    }),
  );
}

/**
 * POST /api/v1/auth/invite/request-code (public). Always 202 with the same message.
 * @param {{ email: string }} params
 * @returns {Promise<AcceptedOut>}
 */
export function requestInviteCode({ email }) {
  return unwrap(api.POST('/api/v1/auth/invite/request-code', { body: { email: email.trim() } }));
}

/*
 * Google sign in (identity v2, prompt 6). All three routes are public: no Authorization header,
 * and a 401 from them never clears a session (PUBLIC_AUTH_PATHS in src/api/client.js). The ID
 * token (credential), the nonce and the signup token exist only in the arguments and the body.
 */

/** @typedef {Schemas['GoogleNonceOut']} GoogleNonceOut */
/** @typedef {Schemas['GoogleAuthResult']} GoogleAuthResult */

/**
 * POST /api/v1/auth/google/nonce (public, no body). 200 `{nonce, expires_in}`; single use.
 * 503 google_unavailable when Google sign in is not configured on the server.
 * @returns {Promise<GoogleNonceOut>}
 */
export function getGoogleNonce() {
  return unwrap(api.POST('/api/v1/auth/google/nonce'));
}

/**
 * POST /api/v1/auth/google (public) with exactly `{credential, nonce}`. 200 GoogleAuthResult:
 * `signed_in` (the AuthResult fields) or `role_required` (signup_token, email, name).
 * @param {{ credential: string, nonce: string }} params
 * @returns {Promise<GoogleAuthResult>}
 */
export function googleSignIn({ credential, nonce }) {
  return unwrap(api.POST('/api/v1/auth/google', { body: { credential, nonce } }));
}

/**
 * POST /api/v1/auth/google/complete (public) with exactly `{signup_token, role}`, where the
 * role is the person's one time choice (farmer or buyer). 201 AuthResult (`signed_in`).
 * @param {{ signupToken: string, role: 'farmer' | 'buyer' }} params
 * @returns {Promise<AuthResult>}
 */
export function googleComplete({ signupToken, role }) {
  return unwrap(
    api.POST('/api/v1/auth/google/complete', { body: { signup_token: signupToken, role } }),
  );
}
