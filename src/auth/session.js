/**
 * Session store, compatible with React's useSyncExternalStore.
 *
 * Security rules (see CLAUDE.md):
 * - The access token lives only here and in sessionStorage (one key, this tab only).
 * - It is never written to localStorage, a URL, a log line or a TanStack Query key.
 * - Clearing the session also clears the TanStack Query cache.
 */
import { useSyncExternalStore } from 'react';
import { queryClient } from '@/lib/queryClient';

const STORAGE_KEY = 'agrisence.session';

/**
 * @typedef {object} Session
 * @property {string | null} accessToken  null for a development fake session
 * @property {string} role
 * @property {boolean} mustChangePassword
 * @property {boolean} isSuperAdmin
 * @property {number} expiresAt  epoch milliseconds
 * @property {string | null} name
 * @property {boolean} [isDevFake]  development only role preview; never persisted, never sent
 */

/** @typedef {'logout' | 'expired' | 'password_changed' | 'dev'} ClearReason */

/** @type {Session | null} */
let state = null;
/** @type {ClearReason | null} */
let lastClearReason = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let expiryTimer = null;
/** @type {Set<() => void>} */
const listeners = new Set();

function storage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** @param {Session | null} next */
function persist(next) {
  const store = storage();
  if (!store) return;
  try {
    if (next && !next.isDevFake) store.setItem(STORAGE_KEY, JSON.stringify(next));
    else store.removeItem(STORAGE_KEY);
  } catch {
    // Storage full or blocked: the session still works for this page load.
  }
}

/** @returns {Session | null} */
function load() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const valid =
      parsed &&
      typeof parsed.accessToken === 'string' &&
      typeof parsed.role === 'string' &&
      typeof parsed.expiresAt === 'number';
    if (!valid || parsed.expiresAt <= Date.now()) {
      store.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      role: parsed.role,
      mustChangePassword: Boolean(parsed.mustChangePassword),
      isSuperAdmin: Boolean(parsed.isSuperAdmin),
      expiresAt: parsed.expiresAt,
      name: typeof parsed.name === 'string' ? parsed.name : null,
    };
  } catch {
    return null;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function scheduleExpiry() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  if (!state || state.isDevFake) return;
  const delay = Math.max(0, state.expiresAt - Date.now());
  expiryTimer = setTimeout(() => clear('expired'), delay);
}

/** @param {Session | null} next */
function setState(next) {
  state = next;
  persist(next);
  scheduleExpiry();
  emit();
}

/**
 * Store the session from a successful POST /auth/login.
 * @param {import('@/api/schema').components['schemas']['TokenResponse']} tokenResponse
 */
export function setFromLogin(tokenResponse) {
  lastClearReason = null;
  setState({
    accessToken: tokenResponse.access_token,
    role: tokenResponse.role,
    mustChangePassword: Boolean(tokenResponse.must_change_password),
    isSuperAdmin: false,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
    name: null,
  });
}

/**
 * Merge the profile from GET /auth/me. That response (UserOut) has no is_super_admin
 * field today; the flag is read only if the backend adds it. Until then, use setSuperAdmin()
 * after the admin users lookup described in docs/backend/frontend_contract.md.
 * @param {import('@/api/schema').components['schemas']['UserOut'] & { is_super_admin?: boolean }} me
 */
export function setProfile(me) {
  if (!state) return;
  setState({
    ...state,
    name: me.name ?? state.name,
    mustChangePassword: Boolean(me.must_change_password),
    isSuperAdmin: typeof me.is_super_admin === 'boolean' ? me.is_super_admin : state.isSuperAdmin,
  });
}

/** @param {boolean} isSuperAdmin */
export function setSuperAdmin(isSuperAdmin) {
  if (!state) return;
  setState({ ...state, isSuperAdmin: Boolean(isSuperAdmin) });
}

/** Called on a 403 password_change_required. */
export function markPasswordChangeRequired() {
  if (!state || state.mustChangePassword) return;
  setState({ ...state, mustChangePassword: true });
}

/**
 * End the session, remove it from storage and clear every cached query.
 * @param {ClearReason} [reason]
 */
export function clear(reason = 'logout') {
  lastClearReason = reason;
  queryClient.clear();
  setState(null);
}

/** The reason of the last clear (for example to show "Your session expired" on the login screen). */
export function getLastClearReason() {
  return lastClearReason;
}

/** @returns {Session | null} */
export function getSession() {
  return state;
}

/** Bearer token for API calls, or null (anonymous, expired or a development fake session). */
export function getToken() {
  if (!state || state.isDevFake || !state.accessToken) return null;
  if (state.expiresAt <= Date.now()) return null;
  return state.accessToken;
}

export function isAuthenticated() {
  return Boolean(state && state.expiresAt > Date.now());
}

/**
 * Development only: an in memory fake session to preview a role's shell without a backend.
 * It has no token, is never persisted and never produces an Authorization header.
 * @param {{ role: string, isSuperAdmin?: boolean, mustChangePassword?: boolean }} options
 */
export function startDevFakeSession({ role, isSuperAdmin = false, mustChangePassword = false }) {
  if (!import.meta.env.DEV) return;
  queryClient.clear();
  lastClearReason = null;
  setState({
    accessToken: null,
    role,
    mustChangePassword,
    isSuperAdmin,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    name: `Preview ${role}`,
    isDevFake: true,
  });
}

/** @param {() => void} listener */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook: the current session or null. */
export function useSession() {
  return useSyncExternalStore(subscribe, getSession, getSession);
}

/** The store as one object, for call sites that prefer `session.clear()`. */
export const session = Object.freeze({
  setFromLogin,
  setProfile,
  setSuperAdmin,
  markPasswordChangeRequired,
  clear,
  getToken,
  getSession,
  isAuthenticated,
  getLastClearReason,
  subscribe,
});

// Restore the session for this tab, and log out when it expires while the tab was hidden
// (timers can be paused in background tabs).
state = load();
scheduleExpiry();
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state && state.expiresAt <= Date.now()) {
      clear('expired');
    }
  });
}
