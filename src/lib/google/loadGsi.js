/**
 * Loads Google Identity Services, the only third party script of this app (the documented
 * exception in CLAUDE.md and docs/security-headers.md). It is loaded on demand, only by the
 * Google button on the sign in and registration screens, and only when Google sign in is
 * configured. Its address appears in this file only (a source check enforces it).
 */

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const SCRIPT_ID = 'agrisence-google-identity';

/** How long to wait for the script before giving up. */
export const GSI_LOAD_TIMEOUT_MS = 10_000;

/** The script could not be loaded (blocked, offline, timed out, or loaded without the API). */
export class GsiLoadError extends Error {
  /** @param {'error' | 'timeout' | 'offline' | 'missing_api'} reason */
  constructor(reason) {
    super(`Google sign in could not be loaded (${reason})`);
    this.name = 'GsiLoadError';
    this.reason = reason;
  }
}

/** @type {Promise<void> | null} */
let pending = null;

/** True once the Google object exposes the Identity Services API. */
function apiReady() {
  return Boolean(window.google?.accounts?.id);
}

function removeTag() {
  document.getElementById(SCRIPT_ID)?.remove();
}

/**
 * Load the script once. Concurrent calls share one load; after a failure the tag is removed
 * and the next call tries again.
 * @returns {Promise<void>}
 */
export function loadGsi() {
  if (apiReady()) return Promise.resolve();
  if (pending) return pending;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.reject(new GsiLoadError('offline'));
  }

  pending = new Promise((resolve, reject) => {
    removeTag();
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;

    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    /** @param {GsiLoadError | null} error */
    const settle = (error) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) {
        removeTag();
        pending = null;
        reject(error);
      } else {
        resolve();
      }
    };
    script.onload = () => settle(apiReady() ? null : new GsiLoadError('missing_api'));
    script.onerror = () => settle(new GsiLoadError('error'));
    timer = setTimeout(() => settle(new GsiLoadError('timeout')), GSI_LOAD_TIMEOUT_MS);
    document.head.appendChild(script);
  });
  return pending;
}

/** Tests only: forget the load and remove the tag. */
export function resetGsiForTests() {
  pending = null;
  removeTag();
}
