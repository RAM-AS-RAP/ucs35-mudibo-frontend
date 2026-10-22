/**
 * Which user rows offer Disable or Enable on the administrator's users screen (F4).
 *
 * This mirrors the server's rules for the UI only, so the screen never offers an action the
 * server will refuse. The server still checks every request (403 cannot_modify_super_admin,
 * cannot_disable_self, forbidden) and the screen shows those answers.
 */

/**
 * @typedef {object} Actor  the signed in administrator
 * @property {string | null | undefined} id  from GET /auth/me (null until the profile loaded)
 * @property {boolean} isSuperAdmin  from is_super_admin in the login response and /auth/me
 */

/**
 * @typedef {object} TargetUser  a row of GET /admin/users
 * @property {string} id
 * @property {string} role
 * @property {boolean} is_super_admin
 */

/**
 * Whether the actor may disable or enable the target account:
 * - never the main administrator's row;
 * - never the actor's own row;
 * - always farmers and buyers;
 * - another administrator only when the actor is the main administrator.
 * @param {{ actor: Actor | null | undefined, target: TargetUser | null | undefined }} params
 * @returns {boolean}
 */
export function canToggleUser({ actor, target }) {
  if (!actor || !target) return false;
  if (target.is_super_admin === true) return false;
  if (actor.id && target.id === actor.id) return false;
  if (target.role === 'farmer' || target.role === 'buyer') return true;
  if (target.role === 'admin') return actor.isSuperAdmin === true;
  return false;
}
