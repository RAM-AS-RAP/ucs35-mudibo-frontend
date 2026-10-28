import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGoogleClientId, isGoogleConfigured } from './config';
import { GSI_LOAD_TIMEOUT_MS, GsiLoadError, loadGsi, resetGsiForTests } from './loadGsi';
import {
  clampButtonWidth,
  disableGoogleAutoSelect,
  initializeGoogle,
  isGoogleLoaded,
  renderGoogleButton,
} from './googleClient';
import { installGoogleStub, removeGoogleStub, TEST_CLIENT_ID } from '@/test/googleStub';

const SRC = 'https://accounts.google.com/gsi/client';
const tags = () => [...document.querySelectorAll('script')].filter((s) => s.src === SRC);

afterEach(() => {
  removeGoogleStub();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('isGoogleConfigured', () => {
  it.each([
    ['', false],
    ['   ', false],
    ['abc', false],
    ['.apps.googleusercontent.com', false],
    ['123-abc.apps.googleusercontent.com.evil.com', false],
    ['123 abc.apps.googleusercontent.com', false],
    [TEST_CLIENT_ID, true],
  ])('%j -> %s', (value, expected) => {
    expect(isGoogleConfigured(value)).toBe(expected);
  });

  it('reads VITE_GOOGLE_CLIENT_ID on every call (empty in the test config)', () => {
    expect(getGoogleClientId()).toBe('');
    expect(isGoogleConfigured()).toBe(false);
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', TEST_CLIENT_ID);
    expect(isGoogleConfigured()).toBe(true);
  });
});

describe('loadGsi', () => {
  it('adds one async, deferred script tag with the exact address, shared by concurrent calls', async () => {
    const first = loadGsi();
    const second = loadGsi();
    expect(second).toBe(first);
    expect(tags()).toHaveLength(1);
    const [tag] = tags();
    expect(tag.async).toBe(true);
    expect(tag.defer).toBe(true);
    expect(tag.parentElement).toBe(document.head);
    installGoogleStub();
    tag.dispatchEvent(new Event('load'));
    await expect(first).resolves.toBeUndefined();
    // Loaded: later calls resolve without a new tag.
    await loadGsi();
    expect(tags()).toHaveLength(1);
  });

  it('rejects on a script error, removes the tag and allows a retry', async () => {
    const attempt = loadGsi();
    tags()[0].dispatchEvent(new Event('error'));
    await expect(attempt).rejects.toBeInstanceOf(GsiLoadError);
    expect(tags()).toHaveLength(0);
    const retry = loadGsi();
    expect(retry).not.toBe(attempt);
    expect(tags()).toHaveLength(1);
    installGoogleStub();
    tags()[0].dispatchEvent(new Event('load'));
    await expect(retry).resolves.toBeUndefined();
  });

  it('rejects after 10 seconds and allows a retry', async () => {
    vi.useFakeTimers();
    const attempt = loadGsi();
    const settled = expect(attempt).rejects.toMatchObject({ reason: 'timeout' });
    vi.advanceTimersByTime(GSI_LOAD_TIMEOUT_MS);
    await settled;
    expect(GSI_LOAD_TIMEOUT_MS).toBe(10_000);
    expect(tags()).toHaveLength(0);
    loadGsi().catch(() => {});
    expect(tags()).toHaveLength(1);
    resetGsiForTests();
  });

  it('rejects a script that loaded without the API', async () => {
    const attempt = loadGsi();
    tags()[0].dispatchEvent(new Event('load'));
    await expect(attempt).rejects.toMatchObject({ reason: 'missing_api' });
  });

  it('does not load while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(loadGsi()).rejects.toMatchObject({ reason: 'offline' });
    expect(tags()).toHaveLength(0);
  });
});

describe('googleClient', () => {
  it('initialises with the documented options and passes only the credential on', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', TEST_CLIENT_ID);
    const stub = installGoogleStub();
    const onCredential = vi.fn();
    initializeGoogle({ nonce: 'nonce-for-this-attempt-0001', onCredential });
    const options = stub.initialize.mock.calls[0][0];
    expect(options).toEqual({
      client_id: TEST_CLIENT_ID,
      callback: expect.any(Function),
      nonce: 'nonce-for-this-attempt-0001',
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: 'popup',
    });
    stub.deliverCredential('the-id-token-from-google-0001');
    expect(onCredential).toHaveBeenCalledWith('the-id-token-from-google-0001');
    stub.deliverCredential(null);
    expect(onCredential).toHaveBeenLastCalledWith(null);
    expect(stub.prompt).not.toHaveBeenCalled();
  });

  it('tolerates a second initialisation with a new nonce (the last one wins)', () => {
    const stub = installGoogleStub();
    initializeGoogle({ nonce: 'first-nonce-value-000001', onCredential: vi.fn() });
    initializeGoogle({ nonce: 'second-nonce-value-00002', onCredential: vi.fn() });
    expect(stub.initialize).toHaveBeenCalledTimes(2);
    expect(stub.lastNonce()).toBe('second-nonce-value-00002');
  });

  it('renders the button with the documented options and a clamped numeric width', () => {
    const stub = installGoogleStub();
    const element = document.createElement('div');
    element.textContent = 'old';
    renderGoogleButton(element, { width: 999.4 });
    expect(stub.renderButton).toHaveBeenCalledWith(element, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      locale: 'en',
      width: 400,
    });
    expect(element.textContent).not.toContain('old');
  });

  it.each([
    [50, 200],
    [200, 200],
    [313.6, 314],
    [401, 400],
    [null, 320],
    [Number.NaN, 320],
  ])('clamps a width of %s to %s', (width, expected) => {
    expect(clampButtonWidth(width)).toBe(expected);
  });

  it('calls disableAutoSelect only when the library is loaded', () => {
    expect(isGoogleLoaded()).toBe(false);
    expect(() => disableGoogleAutoSelect()).not.toThrow();
    const stub = installGoogleStub();
    disableGoogleAutoSelect();
    expect(stub.disableAutoSelect).toHaveBeenCalledTimes(1);
  });
});
