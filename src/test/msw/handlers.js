import { http, HttpResponse } from 'msw';
import { fixtures } from '../fixtures';

export const API_ORIGIN = 'http://localhost:8000';

/** @param {string} path a path from openapi.json, for example /api/v1/health */
export const apiUrl = (path) => `${API_ORIGIN}${path}`;

/**
 * An error response in the backend's envelope.
 * @param {number} status
 * @param {string} code
 * @param {{ message?: string, requestId?: string, headers?: Record<string, string>, extra?: Record<string, unknown> }} [options]
 */
export function errorResponse(
  status,
  code,
  { message = 'Error.', requestId, headers = {}, extra = {} } = {},
) {
  return HttpResponse.json(
    { error: { code, message, ...(requestId ? { request_id: requestId } : {}), ...extra } },
    { status, headers: { ...(requestId ? { 'X-Request-ID': requestId } : {}), ...headers } },
  );
}

/**
 * A 422 validation_error as the backend sends it: `fields` and `details` without the "body" prefix.
 * @param {Array<{ field: string, message: string }>} details
 */
export function validationErrorResponse(details) {
  return errorResponse(422, 'validation_error', {
    message: 'Request validation failed',
    extra: { fields: [...new Set(details.map((d) => d.field))].sort(), details },
  });
}

/**
 * A token response for a role (the login fixture with another role).
 * @param {{ role?: string, mustChangePassword?: boolean, token?: string }} [options]
 */
export function tokenFor({ role = 'farmer', mustChangePassword = false, token } = {}) {
  return {
    ...fixtures.tokenResponse,
    role,
    must_change_password: mustChangePassword,
    ...(token ? { access_token: token } : {}),
  };
}

export const handlers = [
  http.get(apiUrl('/api/v1/health'), () => HttpResponse.json(fixtures.health)),
  http.get(apiUrl('/api/v1/health/db'), () => HttpResponse.json(fixtures.dbHealth)),

  // Authentication: the happy path. Tests override these with server.use().
  http.post(apiUrl('/api/v1/auth/login'), () => HttpResponse.json(fixtures.tokenResponse)),
  http.get(apiUrl('/api/v1/auth/me'), () => HttpResponse.json(fixtures.userMe)),
  http.post(apiUrl('/api/v1/auth/register/farmer'), () =>
    HttpResponse.json(fixtures.registeredUser, { status: 201 }),
  ),
  http.post(apiUrl('/api/v1/auth/register/buyer'), () =>
    HttpResponse.json({ ...fixtures.registeredUser, role: 'buyer' }, { status: 201 }),
  ),
  http.post(apiUrl('/api/v1/auth/change-password'), () =>
    HttpResponse.json(fixtures.passwordChanged),
  ),
  http.post(apiUrl('/api/v1/auth/password-reset/request'), () =>
    HttpResponse.json(fixtures.codeRequested, { status: 202 }),
  ),
  http.post(
    apiUrl('/api/v1/auth/password-reset/confirm'),
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.post(apiUrl('/api/v1/auth/accept-invite'), () =>
    HttpResponse.json(fixtures.adminMe, { status: 201 }),
  ),
  http.post(apiUrl('/api/v1/auth/invite/request-code'), () =>
    HttpResponse.json(fixtures.codeRequested, { status: 202 }),
  ),
];
