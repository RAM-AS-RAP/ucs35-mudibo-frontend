/** The three roles the backend issues in TokenResponse.role. */
export const ROLES = Object.freeze({
  FARMER: 'farmer',
  BUYER: 'buyer',
  ADMIN: 'admin',
});

/** @typedef {'farmer' | 'buyer' | 'admin'} Role */

/** Home path per role. */
export const ROLE_HOME = Object.freeze({
  farmer: '/farmer',
  buyer: '/buyer',
  admin: '/admin',
});

// Where anonymous visitors land. A public landing page will replace the login screen here later.
export const PUBLIC_HOME = '/login';

/**
 * @param {unknown} role
 * @returns {role is Role}
 */
export function isKnownRole(role) {
  return typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_HOME, role);
}

/**
 * Home path for a role, or null for an unknown role.
 * @param {unknown} role
 * @returns {string | null}
 */
export function homeForRole(role) {
  return isKnownRole(role) ? ROLE_HOME[role] : null;
}
