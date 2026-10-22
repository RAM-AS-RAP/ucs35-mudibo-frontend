import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtures } from '@/test/fixtures';
import { queryClient } from '@/lib/queryClient';
import * as session from './session';

const STORAGE_KEY = 'agrisence.session';

afterEach(() => {
  session.clear('logout');
  vi.useRealTimers();
  window.localStorage.clear();
});

/** Assert that nothing was written to localStorage. */
function expectLocalStorageUntouched() {
  expect(window.localStorage.length).toBe(0);
}

describe('session store', () => {
  it('stores the login response in sessionStorage under one key, never in localStorage', () => {
    session.setFromLogin(fixtures.tokenResponse);
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    expect(stored).toMatchObject({
      accessToken: fixtures.tokenResponse.access_token,
      role: 'farmer',
      mustChangePassword: false,
      isSuperAdmin: false,
    });
    expect(window.sessionStorage.length).toBe(1);
    expect(session.getToken()).toBe(fixtures.tokenResponse.access_token);
    expect(session.isAuthenticated()).toBe(true);
    expectLocalStorageUntouched();
  });

  it('restores a valid session and discards an expired one on load', async () => {
    const base = {
      accessToken: 'stored-token',
      role: 'buyer',
      mustChangePassword: false,
      isSuperAdmin: false,
      name: 'Otieno',
    };

    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...base, expiresAt: Date.now() + 60_000 }),
    );
    vi.resetModules();
    const fresh = await import('./session');
    expect(fresh.getSession()).toMatchObject({ role: 'buyer', name: 'Otieno' });

    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...base, expiresAt: Date.now() - 1 }),
    );
    vi.resetModules();
    const expired = await import('./session');
    expect(expired.getSession()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expectLocalStorageUntouched();
  });

  it('ignores malformed stored data', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{not json');
    vi.resetModules();
    const fresh = await import('./session');
    expect(fresh.getSession()).toBeNull();
  });

  it('logs out automatically at expiresAt', () => {
    vi.useFakeTimers();
    session.setFromLogin({ ...fixtures.tokenResponse, expires_in: 60 });
    vi.advanceTimersByTime(59_000);
    expect(session.getSession()).not.toBeNull();
    vi.advanceTimersByTime(1_000);
    expect(session.getSession()).toBeNull();
    expect(session.getLastClearReason()).toBe('expired');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('re-checks expiry when the tab becomes visible', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    session.setFromLogin({ ...fixtures.tokenResponse, expires_in: 60 });
    vi.setSystemTime(Date.now() + 61_000);
    expect(session.getToken()).toBeNull();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(session.getSession()).toBeNull();
  });

  it('clear() empties the TanStack Query cache', () => {
    session.setFromLogin(fixtures.tokenResponse);
    queryClient.setQueryData(['orders', 'mine'], [{ id: 1 }]);
    session.clear('logout');
    expect(queryClient.getQueryData(['orders', 'mine'])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(session.getLastClearReason()).toBe('logout');
  });

  it('reads is_super_admin from the login response', () => {
    session.setFromLogin({ ...fixtures.tokenResponse, role: 'admin', is_super_admin: true });
    expect(session.getSession()?.isSuperAdmin).toBe(true);
    session.setFromLogin({ ...fixtures.tokenResponse, role: 'admin' });
    expect(session.getSession()?.isSuperAdmin).toBe(false);
  });

  it('merges the profile and takes is_super_admin from it', () => {
    session.setFromLogin({ ...fixtures.tokenResponse, role: 'admin' });
    session.setProfile(fixtures.userMe);
    expect(session.getSession()).toMatchObject({ name: 'Wanjiku Kamau', isSuperAdmin: false });
    session.setProfile({ ...fixtures.userMe, is_super_admin: true });
    expect(session.getSession()?.isSuperAdmin).toBe(true);
    session.setProfile(fixtures.userMe);
    expect(session.getSession()?.isSuperAdmin).toBe(false);
    session.setSuperAdmin(true);
    session.setProfile({ ...fixtures.userMe, is_super_admin: /** @type {any} */ ('true') });
    expect(session.getSession()?.isSuperAdmin).toBe(false);
  });

  it('treats an absent is_super_admin as false, in the login response and the profile', () => {
    const { is_super_admin: _login, ...login } = fixtures.tokenResponse;
    session.setFromLogin(/** @type {any} */ ({ ...login, role: 'admin' }));
    expect(session.getSession()?.isSuperAdmin).toBe(false);
    session.setSuperAdmin(true);
    const { is_super_admin: _me, ...me } = fixtures.userMe;
    session.setProfile(/** @type {any} */ (me));
    expect(session.getSession()?.isSuperAdmin).toBe(false);
  });

  it('stores the user id from GET /auth/me (null after login alone) and persists it', async () => {
    session.setFromLogin({ ...fixtures.tokenResponse, role: 'admin' });
    expect(session.getSession()?.userId).toBeNull();
    session.setProfile({ ...fixtures.userMe, role: 'admin' });
    expect(session.getSession()?.userId).toBe(fixtures.userMe.id);
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored.userId).toBe(fixtures.userMe.id);
    // A profile without an id keeps the known one.
    session.setProfile(/** @type {any} */ ({ ...fixtures.userMe, id: undefined }));
    expect(session.getSession()?.userId).toBe(fixtures.userMe.id);
    vi.resetModules();
    const fresh = await import('./session');
    expect(fresh.getSession()?.userId).toBe(fixtures.userMe.id);
  });

  it('marks a required password change', () => {
    session.setFromLogin(fixtures.tokenResponse);
    session.markPasswordChangeRequired();
    expect(session.getSession()?.mustChangePassword).toBe(true);
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}').mustChangePassword).toBe(
      true,
    );
  });

  it('keeps a development fake session in memory only, without a token', () => {
    session.startDevFakeSession({ role: 'farmer' });
    expect(session.getSession()).toMatchObject({
      role: 'farmer',
      isDevFake: true,
      accessToken: null,
    });
    expect(session.getToken()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expectLocalStorageUntouched();
  });

  it('notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    session.setFromLogin(fixtures.tokenResponse);
    session.clear('logout');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it.each([
    ['expired', 'Your session expired. Please sign in again.'],
    ['password_changed', 'Password changed. Please sign in again.'],
    ['unauthorized', 'Please sign in to continue.'],
  ])('clear(%s) leaves a one time flash message', (reason, message) => {
    session.setFromLogin(fixtures.tokenResponse);
    session.clear(/** @type {any} */ (reason));
    expect(session.peekFlash()).toBe(message);
    expect(session.consumeFlash()).toBe(message);
    expect(session.consumeFlash()).toBeNull();
  });

  it('a sign out leaves a silent flash, and the flash is never persisted', () => {
    session.setFromLogin(fixtures.tokenResponse);
    session.clear('logout');
    expect(session.peekFlash()).toBe('');
    session.setFlash('Account created. Please sign in.');
    expect(window.sessionStorage.length).toBe(0);
    expect(session.consumeFlash()).toBe('Account created. Please sign in.');
    expect(session.consumeFlash()).toBeNull();
  });

  it('a new login drops any pending flash', () => {
    session.clear('expired');
    session.setFromLogin(fixtures.tokenResponse);
    expect(session.peekFlash()).toBeNull();
  });

  it('setProfile updates role, name and must_change_password but ignores an unknown role', () => {
    session.setFromLogin(fixtures.tokenResponse);
    session.setProfile({ ...fixtures.userMe, role: 'buyer', must_change_password: true });
    expect(session.getSession()).toMatchObject({
      role: 'buyer',
      name: 'Wanjiku Kamau',
      mustChangePassword: true,
    });
    session.setProfile({ ...fixtures.userMe, role: 'owner' });
    expect(session.getSession()?.role).toBe('buyer');
  });

  it('marks a session restored from storage, but not one from a login', () => {
    session.setFromLogin(fixtures.tokenResponse);
    expect(session.getRestoreId()).toBe(0);
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accessToken: 't', role: 'farmer', expiresAt: Date.now() + 60_000 }),
    );
    session.restore();
    expect(session.getRestoreId()).toBeGreaterThan(0);
    session.clear('logout');
    expect(session.getRestoreId()).toBe(0);
  });
});
