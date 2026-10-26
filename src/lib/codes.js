/**
 * One time codes (registration, sign in, password reset, invitation). Codes are 8 letters and
 * digits, case insensitive, shown as XXXX-XXXX. The exact alphabet (which look alike characters
 * the server leaves out) is not in openapi.json, so any letter or digit is accepted here and the
 * server stays the authority.
 */

export const CODE_LENGTH = 8;

const ALLOWED = new RegExp(`^[A-Z0-9]{${CODE_LENGTH}}$`);

/**
 * Normalise a code as the server does: upper case, no spaces and no hyphens.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeCode(raw) {
  return typeof raw === 'string' ? raw.toUpperCase().replace(/[\s-]/g, '') : '';
}

/**
 * True when the code has exactly 8 characters from the allowed alphabet after normalising
 * (the field may show a hyphen after the fourth character).
 * @param {unknown} raw
 */
export function isPlausibleCode(raw) {
  return ALLOWED.test(normalizeCode(raw));
}
