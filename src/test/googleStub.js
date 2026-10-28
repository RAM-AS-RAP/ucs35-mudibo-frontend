/**
 * A stand in for Google Identity Services in tests: installs `window.google.accounts.id` with
 * spies, so loadGsi() resolves at once and no script or network is used.
 */
import { vi } from 'vitest';
import { resetGsiForTests } from '@/lib/google/loadGsi';

export const TEST_CLIENT_ID = '1234567890-test.apps.googleusercontent.com';
/** An ID token as Google would hand it to the callback (at least 20 characters). */
export const TEST_CREDENTIAL = 'test-google-id-token-not-a-real-jwt-0001';

/**
 * Install the stub. `deliverCredential` calls the callback of the latest initialize() call.
 * @returns {{
 *   initialize: import('vitest').Mock,
 *   renderButton: import('vitest').Mock,
 *   disableAutoSelect: import('vitest').Mock,
 *   prompt: import('vitest').Mock,
 *   cancel: import('vitest').Mock,
 *   deliverCredential: (credential?: string | null) => void,
 *   lastNonce: () => string | undefined,
 *   remove: () => void,
 * }}
 */
export function installGoogleStub() {
  const initialize = vi.fn();
  const renderButton = vi.fn((/** @type {HTMLElement} */ element) => {
    const button = document.createElement('div');
    button.setAttribute('data-testid', 'google-button');
    button.textContent = 'Continue with Google (stub)';
    element.appendChild(button);
  });
  const disableAutoSelect = vi.fn();
  const prompt = vi.fn();
  const cancel = vi.fn();
  /** @type {any} */ (window).google = {
    accounts: { id: { initialize, renderButton, disableAutoSelect, prompt, cancel } },
  };
  const lastOptions = () => initialize.mock.calls.at(-1)?.[0];
  return {
    initialize,
    renderButton,
    disableAutoSelect,
    prompt,
    cancel,
    deliverCredential: (credential = TEST_CREDENTIAL) => {
      const options = lastOptions();
      if (!options) throw new Error('initialize() was not called');
      options.callback(credential === null ? {} : { credential, select_by: 'btn' });
    },
    lastNonce: () => lastOptions()?.nonce,
    remove: () => removeGoogleStub(),
  };
}

/** Remove the stub and any loader state. */
export function removeGoogleStub() {
  delete (/** @type {any} */ (window).google);
  resetGsiForTests();
}

/** Turn Google sign in on for this test (the test config sets an empty client ID). */
export function configureGoogle(clientId = TEST_CLIENT_ID) {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', clientId);
}
