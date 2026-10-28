/**
 * The only code that talks to Google's Identity Services object, so a change in Google's API
 * touches this file only. The rest of the app never reads the global Google object.
 *
 * Only the rendered button is used. One Tap (`prompt()`) is never called.
 */
import { getGoogleClientId } from './config';

export const BUTTON_MIN_WIDTH = 200;
export const BUTTON_MAX_WIDTH = 400;

/** The Identity Services API, or null before the script loaded. */
function gsi() {
  return window.google?.accounts?.id ?? null;
}

/** True once the library is loaded. */
export function isGoogleLoaded() {
  return Boolean(gsi());
}

/**
 * Initialise Identity Services with a fresh nonce. Calling it again (a new nonce) replaces the
 * earlier configuration: the last initialisation wins (Google may log a warning about it).
 * The callback receives only the ID token (`credential`), never the whole response.
 * @param {{ nonce: string, onCredential: (credential: string | null) => void }} options
 */
export function initializeGoogle({ nonce, onCredential }) {
  const id = gsi();
  if (!id) throw new Error('Google Identity Services is not loaded');
  id.initialize({
    client_id: getGoogleClientId(),
    callback: (/** @type {{ credential?: unknown } | undefined} */ response) => {
      const credential = response?.credential;
      onCredential(typeof credential === 'string' && credential ? credential : null);
    },
    nonce,
    auto_select: false,
    cancel_on_tap_outside: true,
    ux_mode: 'popup',
  });
}

/**
 * A button width in whole pixels between 200 and 400 (Google's maximum is 400).
 * @param {number | null | undefined} width
 */
export function clampButtonWidth(width) {
  const value = typeof width === 'number' && Number.isFinite(width) ? Math.round(width) : 320;
  return Math.min(BUTTON_MAX_WIDTH, Math.max(BUTTON_MIN_WIDTH, value));
}

/**
 * Render (or render again) Google's button into an element. The element is emptied first.
 * @param {HTMLElement} element
 * @param {{ width?: number | null }} [options]
 */
export function renderGoogleButton(element, { width } = {}) {
  const id = gsi();
  if (!id) throw new Error('Google Identity Services is not loaded');
  element.replaceChildren();
  id.renderButton(element, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    locale: 'en',
    width: clampButtonWidth(width),
  });
}

/** On sign out: stop Google from choosing the account automatically. Only when loaded. */
export function disableGoogleAutoSelect() {
  gsi()?.disableAutoSelect();
}
