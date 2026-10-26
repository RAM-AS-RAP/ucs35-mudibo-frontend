import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearFlow,
  getFlow,
  getFlowView,
  hasActiveFlow,
  resendRemainingSeconds,
  startFlow,
  subscribeFlow,
  updateResend,
} from './flow';
import { clear, setFromLogin } from './session';

const TOKEN = 'challenge-token-0123456789abcdef';

afterEach(() => {
  clearFlow();
  vi.useRealTimers();
});

describe('flow store', () => {
  it('starts, reads by kind, updates and clears a flow', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFlow(listener);
    startFlow('login', {
      token: TOKEN,
      emailMasked: 'a***@e***.com',
      resendAvailableInSeconds: 60,
      codeSent: false,
    });
    expect(getFlow('login')).toMatchObject({ kind: 'login', token: TOKEN, codeSent: false });
    expect(getFlow('register')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);

    updateResend(30, { codeSent: true });
    expect(getFlow('login')?.codeSent).toBe(true);
    clearFlow();
    expect(getFlow('login')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it('never puts the token in the view that screens read', () => {
    startFlow('register', { token: TOKEN, emailMasked: 'w***@e***.com' });
    const view = getFlowView('register');
    expect(view).toMatchObject({ kind: 'register', emailMasked: 'w***@e***.com' });
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(view && 'token' in view).toBe(false);
  });

  it('replaces the previous flow when a new one starts', () => {
    startFlow('login', { token: TOKEN, emailMasked: 'a' });
    startFlow('register', { token: `${TOKEN}-2`, emailMasked: 'b' });
    expect(getFlow('login')).toBeNull();
    expect(getFlow('register')?.token).toBe(`${TOKEN}-2`);
  });

  it('counts the resend wait on the monotonic clock, not on Date', () => {
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'setInterval'] });
    startFlow('login', { token: TOKEN, emailMasked: 'a', resendAvailableInSeconds: 60 });
    expect(resendRemainingSeconds()).toBe(60);

    // Moving the wall clock (a changed device clock) changes nothing.
    vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    expect(resendRemainingSeconds()).toBe(60);

    vi.advanceTimersByTime(25_000);
    expect(resendRemainingSeconds()).toBe(35);
    vi.advanceTimersByTime(35_000);
    expect(resendRemainingSeconds()).toBe(0);

    updateResend(45);
    expect(resendRemainingSeconds()).toBe(45);
  });

  it('expires a flow after the code validity on the monotonic clock', () => {
    vi.useFakeTimers({ toFake: ['performance', 'Date'] });
    startFlow('login', { token: TOKEN, emailMasked: 'a' });
    expect(hasActiveFlow('login')).toBe(true);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(hasActiveFlow('login')).toBe(false);
  });

  it('ignores missing or negative resend seconds', () => {
    startFlow('login', { token: TOKEN, emailMasked: 'a', resendAvailableInSeconds: -5 });
    expect(resendRemainingSeconds()).toBe(0);
    clearFlow();
    expect(resendRemainingSeconds()).toBe(0);
    updateResend(30);
    expect(getFlow('login')).toBeNull();
  });

  it('is cleared by session.clear() (logout and expiry)', () => {
    for (const reason of /** @type {const} */ (['logout', 'expired'])) {
      startFlow('login', { token: TOKEN, emailMasked: 'a' });
      clear(reason);
      expect(getFlow('login')).toBeNull();
    }
  });

  it('is not persisted anywhere: a fresh module load has no flow', async () => {
    startFlow('register', { token: TOKEN, emailMasked: 'a' });
    setFromLogin({
      status: 'signed_in',
      access_token: 'access-token-not-a-secret',
      token_type: 'bearer',
      expires_in: 3600,
      role: 'farmer',
      must_change_password: false,
      is_super_admin: false,
    });
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(TOKEN);
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(TOKEN);
    clear('logout');

    startFlow('register', { token: TOKEN, emailMasked: 'a' });
    vi.resetModules();
    const fresh = await import('./flow');
    expect(fresh.getFlow('register')).toBeNull();
    expect(fresh.getFlowView('register')).toBeNull();
  });
});
