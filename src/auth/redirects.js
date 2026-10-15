/**
 * Where to go after signing in. The remembered path (router state set by RequireAuth) is used
 * only when it is an internal path inside the role's own route tree, so a crafted link can
 * never send someone to another site (open redirect) or to another role's area.
 */
import { CHANGE_PASSWORD_PATH } from './paths';
import { homeForRole, PUBLIC_HOME } from './roles';

const PROBE_ORIGIN = 'https://agrisence.invalid';

/**
 * Decode percent escapes repeatedly (double encoding), or null when the input is malformed.
 * @param {string} value
 */
function fullyDecode(value) {
  let current = value;
  for (let i = 0; i < 5; i += 1) {
    let next;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) return current;
    current = next;
  }
  return null;
}

/**
 * The normalised path when `value` is a safe internal path, else null.
 * @param {string} value
 */
function internalPath(value) {
  // Must start with exactly one slash; no protocol relative ("//"), backslash or control tricks.
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (
    value.includes('\\') ||
    [...value].some((c) => (c.codePointAt(0) ?? 0) < 32 || c === '\u007f')
  ) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  let url;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  return url;
}

/**
 * @param {string} path  a normalised pathname
 * @param {string} home  the role home, for example /farmer
 */
function insideTree(path, home) {
  return path === home || path.startsWith(`${home}/`);
}

/**
 * The path to open after signing in.
 * - A required password change always wins: /change-password.
 * - Otherwise the remembered path, only when it is internal and inside the role's tree.
 * - Otherwise the role home.
 * @param {{ role: string, mustChangePassword?: boolean } | null} session
 * @param {unknown} fromState  `location.state.from`, or the whole state object
 * @returns {string}
 */
export function getPostLoginPath(session, fromState) {
  if (!session) return PUBLIC_HOME;
  if (session.mustChangePassword) return CHANGE_PASSWORD_PATH;
  const home = homeForRole(session.role);
  if (!home) return PUBLIC_HOME;

  const from =
    fromState && typeof fromState === 'object' && 'from' in fromState
      ? /** @type {{ from: unknown }} */ (fromState).from
      : fromState;
  if (typeof from !== 'string' || from.length > 2048) return home;

  const raw = internalPath(from);
  const decodedText = fullyDecode(from);
  const decoded = decodedText === null ? null : internalPath(decodedText);
  if (!raw || !decoded) return home;
  // Both the path as given and its fully decoded form must stay inside the role's tree.
  if (!insideTree(raw.pathname, home) || !insideTree(decoded.pathname, home)) return home;
  return `${raw.pathname}${raw.search}${raw.hash}`;
}
