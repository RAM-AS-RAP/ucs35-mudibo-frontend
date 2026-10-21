import { api, unwrap } from '../client';

/** @typedef {import('../schema').components['schemas']} Schemas */
/** @typedef {Schemas['TokenResponse']} TokenResponse */
/** @typedef {Schemas['UserOut']} UserOut */
/** @typedef {Schemas['RegisterRequest']} RegisterRequest */
/** @typedef {Schemas['PasswordChangedResponse']} PasswordChangedResponse */
/** @typedef {Schemas['AcceptedOut']} AcceptedOut */

/**
 * The registration body, built from named fields only so that `role` (or any other key)
 * can never be sent. The backend rejects unknown fields with 422 and takes the role from
 * the route. An empty email is omitted.
 * @param {{ name: string, phoneNumber: string, email?: string | null, password: string }} fields
 * @returns {RegisterRequest}
 */
export function buildRegisterBody({ name, phoneNumber, email, password }) {
  /** @type {RegisterRequest} */
  const body = { name: name.trim(), phone_number: phoneNumber, password };
  const trimmedEmail = (email ?? '').trim();
  if (trimmedEmail) body.email = trimmedEmail;
  return body;
}

/**
 * POST /api/v1/auth/login (public).
 * @param {{ identifier: string, password: string }} credentials
 * @returns {Promise<TokenResponse>}
 */
export function login({ identifier, password }) {
  return unwrap(api.POST('/api/v1/auth/login', { body: { identifier, password } }));
}

/**
 * POST /api/v1/auth/register/farmer (public).
 * @param {{ name: string, phoneNumber: string, email?: string | null, password: string }} fields
 * @returns {Promise<UserOut>}
 */
export function registerFarmer(fields) {
  return unwrap(api.POST('/api/v1/auth/register/farmer', { body: buildRegisterBody(fields) }));
}

/**
 * POST /api/v1/auth/register/buyer (public).
 * @param {{ name: string, phoneNumber: string, email?: string | null, password: string }} fields
 * @returns {Promise<UserOut>}
 */
export function registerBuyer(fields) {
  return unwrap(api.POST('/api/v1/auth/register/buyer', { body: buildRegisterBody(fields) }));
}

/**
 * GET /api/v1/auth/me (token). UserOut includes is_super_admin.
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
 * POST /api/v1/auth/password-reset/confirm (public). 204 on success. The code is sent as typed;
 * the server normalises case, spaces and hyphens.
 * @param {{ email: string, code: string, newPassword: string }} params
 * @returns {Promise<void>}
 */
export async function confirmPasswordReset({ email, code, newPassword }) {
  await unwrap(
    api.POST('/api/v1/auth/password-reset/confirm', {
      body: { email: email.trim(), code, new_password: newPassword },
    }),
  );
}

/**
 * POST /api/v1/auth/accept-invite (public). 201 with the new admin user.
 * @param {{ email: string, code: string, password: string }} params
 * @returns {Promise<UserOut>}
 */
export function acceptInvite({ email, code, password }) {
  return unwrap(
    api.POST('/api/v1/auth/accept-invite', { body: { email: email.trim(), code, password } }),
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
