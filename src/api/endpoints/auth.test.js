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
} from './index';

const TOKEN = 'token-that-public-routes-must-not-see';

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

describe('buildRegisterBody', () => {
  it('contains exactly the allowed keys and never role', () => {
    const body = buildRegisterBody({
      name: ' Wanjiku ',
      phoneNumber: '254712345678',
      email: ' w@example.com ',
      password: 'Mavuno#2026',
      // @ts-expect-error an extra key must not pass through
      role: 'admin',
    });
    expect(body).toEqual({
      name: 'Wanjiku',
      phone_number: '254712345678',
      email: 'w@example.com',
      password: 'Mavuno#2026',
    });
  });

  it('omits an empty email', () => {
    const body = buildRegisterBody({
      name: 'Otieno',
      phoneNumber: '254712345678',
      email: '  ',
      password: 'x',
    });
    expect(Object.keys(body).sort()).toEqual(['name', 'password', 'phone_number']);
  });
});

describe('public auth routes', () => {
  const PUBLIC_CALLS = [
    [
      '/api/v1/auth/login',
      () => login({ identifier: '0712345678', password: 'pw' }),
      () => HttpResponse.json(fixtures.tokenResponse),
    ],
    [
      '/api/v1/auth/register/farmer',
      () => registerFarmer({ name: 'Wa', phoneNumber: '254712345678', password: 'pw' }),
      () => HttpResponse.json(fixtures.registeredUser, { status: 201 }),
    ],
    [
      '/api/v1/auth/register/buyer',
      () => registerBuyer({ name: 'Wa', phoneNumber: '254712345678', password: 'pw' }),
      () => HttpResponse.json(fixtures.registeredUser, { status: 201 }),
    ],
    [
      '/api/v1/auth/password-reset/request',
      () => requestPasswordReset({ email: 'a@example.com' }),
      () => HttpResponse.json(fixtures.codeRequested, { status: 202 }),
    ],
    [
      '/api/v1/auth/password-reset/confirm',
      () => confirmPasswordReset({ email: 'a@example.com', code: 'ABCD-2345', newPassword: 'pw' }),
      () => new HttpResponse(null, { status: 204 }),
    ],
    [
      '/api/v1/auth/accept-invite',
      () => acceptInvite({ email: 'a@example.com', code: 'ABCD-2345', password: 'pw' }),
      () => HttpResponse.json(fixtures.adminMe, { status: 201 }),
    ],
    [
      '/api/v1/auth/invite/request-code',
      () => requestInviteCode({ email: 'a@example.com' }),
      () => HttpResponse.json(fixtures.codeRequested, { status: 202 }),
    ],
  ];

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

  it('sends the expected bodies', async () => {
    const reset = capture(
      'post',
      '/api/v1/auth/password-reset/confirm',
      () => new HttpResponse(null, { status: 204 }),
    );
    await expect(
      confirmPasswordReset({
        email: ' a@example.com ',
        code: 'abcd-2345',
        newPassword: 'New#pass1',
      }),
    ).resolves.toBeUndefined();
    expect(reset.body).toEqual({
      email: 'a@example.com',
      code: 'abcd-2345',
      new_password: 'New#pass1',
    });

    const invite = capture('post', '/api/v1/auth/accept-invite', () =>
      HttpResponse.json(fixtures.adminMe, { status: 201 }),
    );
    await acceptInvite({ email: 'a@example.com', code: 'ABCD-2345', password: 'Long#password1' });
    expect(invite.body).toEqual({
      email: 'a@example.com',
      code: 'ABCD-2345',
      password: 'Long#password1',
    });
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
