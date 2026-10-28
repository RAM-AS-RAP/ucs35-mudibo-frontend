/**
 * The in memory store of the code step of a sign in or a registration (identity v2).
 *
 * It holds the registration token or the sign in challenge token, which are secrets for one
 * flow. They live only in this module's memory: never in sessionStorage, localStorage, a URL,
 * router state, history state, a query key or a log. A page reload loses them, and the person
 * starts again; that is intended.
 *
 * The resend countdown uses performance.now() (a monotonic clock), so changing the device clock
 * or remounting a screen cannot break it.
 *
 * The store is cleared by session.clear() (logout and expiry), after a successful sign in, on
 * "Start again" and on challenge_closed.
 *
 * Google sign in (prompt 6) adds the kind "google": the signup token of a new Google account
 * that still has to choose farmer or buyer, with the person's own Google email and name (for
 * display) and an optional preferred role. The server owns its expiry (signup_expires_at), so no
 * deadline is kept: an expired ticket is reported by the server (invalid_or_expired_ticket).
 * It is cleared like the others, and also on invalid_or_expired_ticket and google_retry.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

/** @typedef {'login' | 'register'} FlowKind */
/** @typedef {'farmer' | 'buyer'} SignupRole */

/**
 * @typedef {object} Flow
 * @property {FlowKind} kind
 * @property {string} token  registration_token or challenge_token (secret)
 * @property {string} emailMasked
 * @property {number} resendDeadline  performance.now() value when Resend becomes available
 * @property {number} expiresDeadline  performance.now() value when the code stops working
 * @property {boolean} codeSent  false when the server could not send the email
 */

/**
 * What screens may read: everything except the token.
 * @typedef {Omit<Flow, 'token'>} FlowView
 */

/** How long a code is valid (the server's documented values). */
export const CODE_VALIDITY_SECONDS = Object.freeze({ login: 10 * 60, register: 15 * 60 });

/**
 * @typedef {object} GoogleFlow
 * @property {'google'} kind
 * @property {string} token  the signup_token (secret)
 * @property {string} email  the person's own Google email (display only)
 * @property {string} name  the name from Google (display only)
 * @property {SignupRole | null} preferredRole  the role card chosen on /register, if any
 */

/**
 * What screens may read of a Google flow: everything except the token.
 * @typedef {Omit<GoogleFlow, 'token'>} GoogleFlowView
 */

/** @type {Flow | GoogleFlow | null} */
let flow = null;
/** @type {FlowView | GoogleFlowView | null} */
let view = null;
/** @type {Set<() => void>} */
const listeners = new Set();

const now = () => performance.now();

/** @param {number | null | undefined} seconds */
const safeSeconds = (seconds) =>
  typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : 0;

/** @param {Flow | GoogleFlow | null} next */
function set(next) {
  flow = next;
  // The token is left out of what screens read.
  if (next && next.kind === 'google') {
    view = Object.freeze({
      kind: next.kind,
      email: next.email,
      name: next.name,
      preferredRole: next.preferredRole,
    });
    for (const listener of listeners) listener();
    return;
  }
  view = next
    ? Object.freeze({
        kind: next.kind,
        emailMasked: next.emailMasked,
        resendDeadline: next.resendDeadline,
        expiresDeadline: next.expiresDeadline,
        codeSent: next.codeSent,
      })
    : null;
  for (const listener of listeners) listener();
}

/**
 * Start (or replace) the flow of a kind. A new sign in or registration replaces the previous
 * one, as on the server.
 * @param {FlowKind} kind
 * @param {{ token: string, emailMasked: string, resendAvailableInSeconds?: number | null, codeSent?: boolean | null }} init
 */
export function startFlow(kind, { token, emailMasked, resendAvailableInSeconds, codeSent }) {
  const start = now();
  set({
    kind,
    token,
    emailMasked,
    resendDeadline: start + safeSeconds(resendAvailableInSeconds) * 1000,
    expiresDeadline: start + CODE_VALIDITY_SECONDS[kind] * 1000,
    codeSent: codeSent !== false,
  });
}

/**
 * Restart the resend countdown (after a resend, or from Retry-After on resend_cooldown).
 * `codeSent` is updated when given; a new code also restarts the validity.
 * @param {number | null | undefined} seconds
 * @param {{ codeSent?: boolean, newCode?: boolean }} [options]
 */
export function updateResend(seconds, { codeSent, newCode = false } = {}) {
  if (!flow || flow.kind === 'google') return;
  const start = now();
  set({
    ...flow,
    resendDeadline: start + safeSeconds(seconds) * 1000,
    ...(newCode ? { expiresDeadline: start + CODE_VALIDITY_SECONDS[flow.kind] * 1000 } : {}),
    ...(typeof codeSent === 'boolean' ? { codeSent } : {}),
  });
}

/**
 * The flow of a kind, with its token, or null. Used only by src/auth/auth.js.
 * @param {FlowKind} kind
 * @returns {Flow | null}
 */
export function getFlow(kind) {
  return flow && flow.kind === kind ? /** @type {Flow} */ (flow) : null;
}

/**
 * The flow of a kind without its token, or null (for screens, outside React rendering hooks).
 * @param {FlowKind} kind
 * @returns {FlowView | null}
 */
export function getFlowView(kind) {
  return view && view.kind === kind ? /** @type {FlowView} */ (view) : null;
}

/** Forget the flow and its token. */
export function clearFlow() {
  if (flow) set(null);
}

/** Seconds left before Resend is available (0 when there is no flow). */
export function resendRemainingSeconds() {
  if (!flow || flow.kind === 'google') return 0;
  return Math.max(0, Math.ceil((flow.resendDeadline - now()) / 1000));
}

/**
 * True while a flow of the kind exists and its code has not expired.
 * @param {FlowKind} kind
 */
export function hasActiveFlow(kind) {
  const current = getFlow(kind);
  return Boolean(current && current.expiresDeadline > now());
}

/** @param {() => void} listener */
export function subscribeFlow(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * React hook: the flow of a kind without its token, or null.
 * @param {FlowKind} kind
 * @returns {FlowView | null}
 */
export function useFlowView(kind) {
  const current = useSyncExternalStore(
    subscribeFlow,
    () => view,
    () => null,
  );
  return current && current.kind === kind ? /** @type {FlowView} */ (current) : null;
}

/** @param {unknown} role @returns {SignupRole | null} */
const signupRole = (role) => (role === 'farmer' || role === 'buyer' ? role : null);

/**
 * Start (or replace) the Google role step after a role_required answer. A newer Google sign in
 * replaces it, as on the server (the older signup token stops working).
 * @param {{ signupToken: string, email?: string | null, name?: string | null, preferredRole?: unknown }} init
 */
export function startGoogleFlow({ signupToken, email, name, preferredRole }) {
  set({
    kind: 'google',
    token: signupToken,
    email: typeof email === 'string' ? email : '',
    name: typeof name === 'string' ? name.trim() : '',
    preferredRole: signupRole(preferredRole),
  });
}

/**
 * The Google flow with its signup token, or null. Used only by src/auth/auth.js.
 * @returns {GoogleFlow | null}
 */
export function getGoogleFlow() {
  return flow && flow.kind === 'google' ? flow : null;
}

/**
 * The Google flow without its token, or null (for screens).
 * @returns {GoogleFlowView | null}
 */
export function getGoogleFlowView() {
  return view && view.kind === 'google' ? /** @type {GoogleFlowView} */ (view) : null;
}

/**
 * React hook: the Google flow without its token, or null.
 * @returns {GoogleFlowView | null}
 */
export function useGoogleFlowView() {
  const current = useSyncExternalStore(
    subscribeFlow,
    () => view,
    () => null,
  );
  return current && current.kind === 'google' ? /** @type {GoogleFlowView} */ (current) : null;
}

/** How often the resend countdown re-reads the monotonic clock while it runs. */
const TICK_MS = 250;

/**
 * React hook: seconds left before Resend is available, derived from the monotonic deadline on
 * every tick (so a remount or a changed device clock never restarts or breaks it).
 */
export function useResendRemaining() {
  const current = useSyncExternalStore(
    subscribeFlow,
    () => view,
    () => null,
  );
  const [, setTick] = useState(0);
  const remaining = current ? resendRemainingSeconds() : 0;
  const active = remaining > 0;

  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [active, current]);

  return remaining;
}
