/**
 * Google sign in configuration (identity v2, prompt 6).
 *
 * VITE_GOOGLE_CLIENT_ID is the OAuth client ID of the Google Cloud project: a public value
 * (it is in every page that shows the button), not a secret. Without a valid value no Google UI
 * is rendered, no script is loaded and no Google request is made.
 */

const CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

/** The client ID of this build (read on every call, so tests can change it). */
export function getGoogleClientId() {
  const value = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof value === 'string' ? value.trim() : '';
}

/** The client ID read when the module loaded. */
export const GOOGLE_CLIENT_ID = getGoogleClientId();

/**
 * True only for a non empty client ID ending in `.apps.googleusercontent.com`.
 * @param {string} [clientId]
 */
export function isGoogleConfigured(clientId = getGoogleClientId()) {
  return (
    typeof clientId === 'string' &&
    clientId.length > CLIENT_ID_SUFFIX.length &&
    clientId.endsWith(CLIENT_ID_SUFFIX) &&
    !/\s/.test(clientId)
  );
}
