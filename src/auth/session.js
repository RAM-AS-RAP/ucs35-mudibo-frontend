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
import { MESSAGES } from '@/lib/messages';
import { isKnownRole } from './roles';

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

/** @typedef {'logout' | 'expired' | 'password_changed' | 'unauthorized' | 'dev'} ClearReason */

/**
 * The one time message each clear reason leaves for the login screen. A sign out leaves an
 * empty, silent message: nothing is shown, and the login screen also skips its
 * "Please sign in to continue." hint.
 */
const FLASH_BY_REASON = Object.freeze({
  logout: '',
  dev: null,
  expired: MESSAGES.flash.expired,
  password_changed: MESSAGES.flash.passwordChanged,
  unauthorized: MESSAGES.flash.unauthorized,
});

/** @type {Session | null} */
let state = null;
/** @type {ClearReason | null} */
let lastClearReason = null;
/** One time message for the login screen. In memory only, never persisted. */
/** @type {string | null} */
let flash = null;
/**
 * Non zero while the current session was restored from sessionStorage (not created by a login
 * in this page load); increases on every restore so startup revalidation runs once per restore.
 */
let restoreId = 0;
let restoreCounter = 0;
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
  flash = null;
  restoreId = 0;
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
 * Merge the profile from GET /auth/me: name, role and must_change_password. That response
 * (UserOut) has no is_super_admin field today; the flag is read only if the backend adds it,
 * and is otherwise left as it is (false after a login). It is never guessed from anything else.
 * @param {import('@/api/schema').components['schemas']['UserOut'] & { is_super_admin?: boolean }} me
 */
export function setProfile(me) {
  if (!state) return;
  setState({
    ...state,
    name: typeof me.name === 'string' && me.name.trim() ? me.name.trim() : state.name,
    role: isKnownRole(me.role) ? me.role : state.role,
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
 * End the session, remove it from storage and clear every cached query. The reason leaves a
 * one time flash message for the login screen (`expired`, `password_changed`, `unauthorized`).
 * @param {ClearReason} [reason]
 */
export function clear(reason = 'logout') {
  lastClearReason = reason;
  flash = FLASH_BY_REASON[reason] ?? null;
  restoreId = 0;
  queryClient.clear();
  setState(null);
}

/** The reason of the last clear. */
export function getLastClearReason() {
  return lastClearReason;
}

/**
 * Leave a one time message for the login screen without a session (for example
 * "Account created. Please sign in.").
 * @param {string | null} message
 */
export function setFlash(message) {
  flash = message;
}

/** Read the flash message without consuming it ('' after a sign out, null when there is none). */
export function peekFlash() {
  return flash;
}

/** Read and remove the flash message (it is shown once). */
export function consumeFlash() {
  const message = flash;
  flash = null;
  return message;
}

/** Non zero while the current session came from sessionStorage at startup (see restore()). */
export function getRestoreId() {
  return restoreId;
}

/**
 * Load the session of this tab from sessionStorage. Runs once when the module loads; a
 * restored session is revalidated with GET /auth/me before protected routes render.
 */
export function restore() {
  const loaded = load();
  restoreCounter += 1;
  restoreId = loaded ? restoreCounter : 0;
  state = loaded;
  scheduleExpiry();
  emit();
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
  flash = null;
  restoreId = 0;
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
  setFlash,
  peekFlash,
  consumeFlash,
  subscribe,
});

// Restore the session for this tab, and log out when it expires while the tab was hidden
// (timers can be paused in background tabs).
restore();
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state && state.expiresAt <= Date.now()) {
      clear('expired');
    }
  });
}
