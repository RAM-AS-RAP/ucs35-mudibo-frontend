import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { loginAs } from '@/test/render';
import * as session from '@/auth/session';
import { setNavigator } from '../client';
import {
  acceptInvite,
  buildRegisterBody,
  changePassword,
  confirmPasswordReset,
  getMe,
  login,
  registerBuyer,
  registerFarmer,
  requestInviteCode,
  requestPasswordReset,
  resendLoginCode,
  resendRegistrationCode,
  verifyLogin,
  verifyRegistration,
} from './index';

const TOKEN = 'token-that-public-routes-must-not-see';
const CHALLENGE = 'challenge-token-0123456789abcdef';
const REGISTRATION = 'registration-token-0123456789abcdef';

afterEach(() => session.clear('logout'));

/**
 * Record what reaches a route.
 * @param {'get' | 'post'} method
 * @param {string} path
 * @param {() => Response} respond
 */
function capture(method, path, respond) {
  const seen = {
    authorization: /** @type {string | null} */ (null),
    body: /** @type {any} */ (null),
    calls: 0,
  };
  server.use(
    http[method](apiUrl(path), async ({ request }) => {
      seen.calls += 1;
      seen.authorization = request.headers.get('Authorization');
      const text = await request.text();
      seen.body = text ? JSON.parse(text) : null;
      return respond();
    }),
  );
  return seen;
}

const signedIn = () => HttpResponse.json(fixtures.tokenResponse);
const adminSignedIn = () =>
  HttpResponse.json({ ...fixtures.tokenResponse, role: 'admin' }, { status: 201 });

describe('buildRegisterBody', () => {
  it('contains exactly name, email and password, and never role or phone_number', () => {
    const body = buildRegisterBody({
      name: ' Wanjiku ',
      email: ' w@example.com ',
      password: 'Mavuno#2026',
      // @ts-expect-error an extra key must not pass through
      role: 'admin',
      phone_number: '254712345678',
      identifier: 'x',
    });
    expect(body).toEqual({ name: 'Wanjiku', email: 'w@example.com', password: 'Mavuno#2026' });
  });
});

/**
 * Every public route: path, call, response, and the exact body it must send (codes normalised).
 * @type {Array<[string, () => Promise<unknown>, () => Response, Record<string, unknown>]>}
 */
const PUBLIC_CALLS = [
  [
    '/api/v1/auth/login',
    () => login({ email: ' w@example.com ', password: 'Pw#1 x' }),
    signedIn,
    { email: 'w@example.com', password: 'Pw#1 x' },
  ],
  [
    '/api/v1/auth/login/verify',
    () => verifyLogin({ challengeToken: CHALLENGE, code: ' abcd-2345 ' }),
    signedIn,
    { challenge_token: CHALLENGE, code: 'ABCD2345' },
  ],
  [
    '/api/v1/auth/login/resend',
    () => resendLoginCode({ challengeToken: CHALLENGE }),
    () => HttpResponse.json(fixtures.loginResent),
    { challenge_token: CHALLENGE },
  ],
  [
    '/api/v1/auth/register/farmer',
    () => registerFarmer({ name: 'Wanjiku', email: 'w@example.com', password: 'Pw#12345' }),
    () => HttpResponse.json(fixtures.registrationAccepted, { status: 202 }),
    { name: 'Wanjiku', email: 'w@example.com', password: 'Pw#12345' },
  ],
  [
    '/api/v1/auth/register/buyer',
    () => registerBuyer({ name: ' Otieno ', email: 'o@example.com', password: 'Pw#12345' }),
    () => HttpResponse.json(fixtures.registrationAccepted, { status: 202 }),
    { name: 'Otieno', email: 'o@example.com', password: 'Pw#12345' },
  ],
  [
    '/api/v1/auth/register/verify',
    () => verifyRegistration({ registrationToken: REGISTRATION, code: 'ab cd 23 45' }),
    () => HttpResponse.json(fixtures.tokenResponse, { status: 201 }),
    { registration_token: REGISTRATION, code: 'ABCD2345' },
  ],
  [
    '/api/v1/auth/register/resend',
    () => resendRegistrationCode({ registrationToken: REGISTRATION }),
    () => HttpResponse.json(fixtures.registrationResent, { status: 202 }),
    { registration_token: REGISTRATION },
  ],
  [
    '/api/v1/auth/password-reset/request',
    () => requestPasswordReset({ email: ' a@example.com ' }),
    () => HttpResponse.json(fixtures.codeRequested, { status: 202 }),
    { email: 'a@example.com' },
  ],
  [
    '/api/v1/auth/password-reset/confirm',
    () =>
      confirmPasswordReset({ email: ' a@example.com ', code: 'abcd-2345', newPassword: 'N#p1' }),
    () => new HttpResponse(null, { status: 204 }),
    { email: 'a@example.com', code: 'ABCD2345', new_password: 'N#p1' },
  ],
  [
    '/api/v1/auth/accept-invite',
    () => acceptInvite({ email: 'a@example.com', code: 'abcd-2345', password: 'Long#password1' }),
    adminSignedIn,
    { email: 'a@example.com', code: 'ABCD2345', password: 'Long#password1' },
  ],
  [
    '/api/v1/auth/invite/request-code',
    () => requestInviteCode({ email: 'a@example.com' }),
    () => HttpResponse.json(fixtures.codeRequested, { status: 202 }),
    { email: 'a@example.com' },
  ],
];

describe('public auth routes', () => {
  it.each(PUBLIC_CALLS)(
    '%s sends no Authorization header even when signed in',
    async (path, call, respond) => {
      loginAs('farmer', { token: TOKEN });
      const seen = capture('post', path, respond);
      await call();
      expect(seen.calls).toBe(1);
      expect(seen.authorization).toBeNull();
    },
  );

  it.each(PUBLIC_CALLS)('a 401 from %s never clears the session', async (path, call) => {
    loginAs('farmer', { token: TOKEN });
    const navigate = vi.fn();
    setNavigator(navigate);
    server.use(http.post(apiUrl(path), () => errorResponse(401, 'invalid_credentials')));
    await expect(call()).rejects.toMatchObject({ status: 401 });
    expect(session.getSession()).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(PUBLIC_CALLS)(
    '%s sends exactly the documented keys (never role, phone_number or identifier)',
    async (path, call, respond, body) => {
      const seen = capture('post', path, respond);
      await call();
      expect(seen.body).toEqual(body);
      for (const key of ['role', 'phone_number', 'identifier']) {
        expect(Object.keys(seen.body)).not.toContain(key);
      }
    },
  );

  it('returns the AuthResult as the server sent it, in both statuses', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/login'), () => HttpResponse.json(fixtures.authCodeRequired)),
    );
    await expect(login({ email: 'w@example.com', password: 'pw' })).resolves.toEqual(
      fixtures.authCodeRequired,
    );
    server.use(http.post(apiUrl('/api/v1/auth/login'), signedIn));
    await expect(login({ email: 'w@example.com', password: 'pw' })).resolves.toEqual(
      fixtures.tokenResponse,
    );
  });
});

describe('token routes', () => {
  it('getMe and changePassword send the bearer token', async () => {
    loginAs('farmer', { token: TOKEN });
    const me = capture('get', '/api/v1/auth/me', () => HttpResponse.json(fixtures.userMe));
    await expect(getMe()).resolves.toEqual(fixtures.userMe);
    expect(me.authorization).toBe(`Bearer ${TOKEN}`);

    const change = capture('post', '/api/v1/auth/change-password', () =>
      HttpResponse.json(fixtures.passwordChanged),
    );
    await expect(
      changePassword({ currentPassword: 'Old#pass1', newPassword: 'New#pass1' }),
    ).resolves.toEqual(fixtures.passwordChanged);
    expect(change.authorization).toBe(`Bearer ${TOKEN}`);
    expect(change.body).toEqual({ current_password: 'Old#pass1', new_password: 'New#pass1' });
  });
});
