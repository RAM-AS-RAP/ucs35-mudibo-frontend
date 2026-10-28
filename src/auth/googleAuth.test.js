import { afterEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { loginAs, logout } from '@/test/render';
import { getGoogleNonce, googleComplete, googleSignIn } from '@/api/endpoints';
import { PUBLIC_AUTH_PATHS } from '@/api/client';
import { completeGoogleSignup, isRoleRequired, isSignedIn, signInWithGoogle } from './auth';
import {
  clearFlow,
  getFlowView,
  getGoogleFlow,
  getGoogleFlowView,
  startFlow,
  startGoogleFlow,
} from './flow';
import { clear, getSession, restore, setProfile } from './session';

afterEach(() => {
  clearFlow();
  logout();
});

/** Record the method, Authorization header and body of one Google route. */
function record(path, answer) {
  /** @type {{ authorization: string | null, body: unknown }[]} */
  const calls = [];
  server.use(
    http.post(apiUrl(path), async ({ request }) => {
      const text = await request.clone().text();
      calls.push({
        authorization: request.headers.get('Authorization'),
        body: text ? JSON.parse(text) : null,
      });
      return answer();
    }),
  );
  return calls;
}

describe('Google endpoints', () => {
  it('are public routes', () => {
    for (const path of [
      '/api/v1/auth/google/nonce',
      '/api/v1/auth/google',
      '/api/v1/auth/google/complete',
    ]) {
      expect(PUBLIC_AUTH_PATHS).toContain(path);
    }
  });

  it('send no Authorization header, even with a session, and exactly the named keys', async () => {
    loginAs('farmer');
    const nonceCalls = record('/api/v1/auth/google/nonce', () =>
      HttpResponse.json(fixtures.googleNonce),
    );
    const signInCalls = record('/api/v1/auth/google', () =>
      HttpResponse.json(fixtures.googleSignedIn),
    );
    const completeCalls = record('/api/v1/auth/google/complete', () =>
      HttpResponse.json(fixtures.googleSignedIn, { status: 201 }),
    );
    await expect(getGoogleNonce()).resolves.toEqual(fixtures.googleNonce);
    await googleSignIn({
      credential: 'credential-value-0001-long',
      nonce: 'nonce-value-0001-long',
    });
    await googleComplete({ signupToken: 'signup-token-0001-long', role: 'buyer' });
    expect(nonceCalls).toEqual([{ authorization: null, body: null }]);
    expect(signInCalls).toEqual([
      {
        authorization: null,
        body: { credential: 'credential-value-0001-long', nonce: 'nonce-value-0001-long' },
      },
    ]);
    expect(completeCalls).toEqual([
      { authorization: null, body: { signup_token: 'signup-token-0001-long', role: 'buyer' } },
    ]);
  });

  it('a 401 from POST /auth/google keeps an existing session', async () => {
    loginAs('buyer');
    record('/api/v1/auth/google', () => errorResponse(401, 'google_sign_in_failed'));
    await expect(
      googleSignIn({ credential: 'credential-value-0001-long', nonce: 'nonce-value-0001-long' }),
    ).rejects.toMatchObject({ code: 'google_sign_in_failed' });
    expect(getSession()).toMatchObject({ role: 'buyer' });
  });
});

describe('isSignedIn and isRoleRequired', () => {
  it.each([
    [fixtures.googleSignedIn, true, false],
    [fixtures.tokenResponse, true, false],
    [fixtures.googleRoleRequired, false, true],
    [fixtures.authCodeRequired, false, false],
    [{ status: 'signed_in' }, false, false],
    [{ status: 'signed_in', access_token: '', role: 'farmer' }, false, false],
    [{ status: 'role_required', signup_token: '' }, false, false],
    [null, false, false],
  ])('%j', (result, signedIn, roleRequired) => {
    expect(isSignedIn(/** @type {any} */ (result))).toBe(signedIn);
    expect(isRoleRequired(/** @type {any} */ (result))).toBe(roleRequired);
  });
});

describe('signInWithGoogle and completeGoogleSignup', () => {
  it('signed_in stores the session and the profile', async () => {
    const outcome = await signInWithGoogle({
      credential: 'credential-value-0001-long',
      nonce: 'nonce-value-0001-long',
    });
    expect(outcome.status).toBe('signed_in');
    expect(getSession()).toMatchObject({ role: 'farmer', name: 'Wanjiku Kamau' });
  });

  it('role_required starts the Google flow, keeps the token out of the view', async () => {
    record('/api/v1/auth/google', () => HttpResponse.json(fixtures.googleRoleRequired));
    const outcome = await signInWithGoogle({
      credential: 'credential-value-0001-long',
      nonce: 'nonce-value-0001-long',
      preferredRole: 'admin',
    });
    expect(outcome).toEqual({ status: 'role_required' });
    expect(getSession()).toBeNull();
    expect(getGoogleFlow()?.token).toBe(fixtures.googleRoleRequired.signup_token);
    // An unknown preferred role is dropped; the view has no token.
    expect(getGoogleFlowView()).toEqual({
      kind: 'google',
      email: 'achieng.google@example.com',
      name: 'Achieng Otieno',
      preferredRole: null,
    });
    expect(JSON.stringify(getGoogleFlowView())).not.toContain('signup');
  });

  it('an unexpected answer is an error', async () => {
    record('/api/v1/auth/google', () => HttpResponse.json({ status: 'role_required' }));
    await expect(
      signInWithGoogle({
        credential: 'credential-value-0001-long',
        nonce: 'nonce-value-0001-long',
      }),
    ).rejects.toMatchObject({ code: 'unexpected_response' });
  });

  it.each(['invalid_or_expired_ticket', 'google_retry'])('%s clears the flow', async (code) => {
    startGoogleFlow({ signupToken: 'signup-token-0001-long', email: 'a@example.com', name: 'A' });
    record('/api/v1/auth/google/complete', () =>
      errorResponse(code === 'google_retry' ? 409 : 400, code),
    );
    await expect(completeGoogleSignup('farmer')).rejects.toMatchObject({ code });
    expect(getGoogleFlow()).toBeNull();
  });

  it('a 422 keeps the flow; without a flow the step reports flow_lost', async () => {
    startGoogleFlow({ signupToken: 'signup-token-0001-long', email: 'a@example.com', name: 'A' });
    record('/api/v1/auth/google/complete', () => errorResponse(422, 'validation_error'));
    await expect(completeGoogleSignup('farmer')).rejects.toMatchObject({ status: 422 });
    expect(getGoogleFlow()).not.toBeNull();
    clearFlow();
    await expect(completeGoogleSignup('farmer')).rejects.toMatchObject({ code: 'flow_lost' });
  });
});

describe('the Google flow store', () => {
  it('replaces a code flow and is replaced by one (one flow at a time)', () => {
    startFlow('login', { token: 'challenge-0001', emailMasked: 'a***@e***.com' });
    startGoogleFlow({ signupToken: 'signup-token-0001-long', email: 'a@example.com', name: ' A ' });
    expect(getFlowView('login')).toBeNull();
    expect(getGoogleFlowView()?.name).toBe('A');
    startFlow('login', { token: 'challenge-0002', emailMasked: 'a***@e***.com' });
    expect(getGoogleFlowView()).toBeNull();
  });

  it('is cleared by logout and expiry and never written to storage', () => {
    startGoogleFlow({ signupToken: 'signup-token-0001-long', email: 'a@example.com', name: 'A' });
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain('signup-token');
    clear('expired');
    expect(getGoogleFlow()).toBeNull();
  });
});

describe('session sign-in method flags', () => {
  it('defaults to a password and no Google, then takes the profile values', () => {
    loginAs('buyer');
    expect(getSession()).toMatchObject({ passwordSet: true, googleLinked: false });
    setProfile({ ...fixtures.userMeGoogle });
    expect(getSession()).toMatchObject({ passwordSet: false, googleLinked: true });
    // Absent fields count as password set and not linked.
    const { password_set: _p, google_linked: _g, ...old } = fixtures.userMe;
    setProfile(/** @type {any} */ (old));
    expect(getSession()).toMatchObject({ passwordSet: true, googleLinked: false });
  });

  it('survives a restore from sessionStorage', () => {
    loginAs('buyer');
    setProfile({ ...fixtures.userMeGoogle });
    restore();
    expect(getSession()).toMatchObject({ passwordSet: false, googleLinked: true });
  });
});
