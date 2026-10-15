/**
 * Sign in and sign out, shared by the login, registration and invite screens.
 * Credentials exist only in the arguments of signIn and the request body; they are never
 * stored, logged or put in a query key.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { getMe, login as loginRequest } from '@/api/endpoints';
import { markReachable } from '@/lib/connectivity';
import { clear, getSession, setFromLogin, setProfile } from './session';

// While a screen signs someone in, PublicOnly must not redirect: the screen itself decides
// where to go (the remembered path, or /change-password) once the profile has loaded.
let holds = 0;
/** @type {Set<() => void>} */
const holdListeners = new Set();
const emitHolds = () => holdListeners.forEach((listener) => listener());

/**
 * Keep PublicOnly from redirecting until the returned release function is called.
 * @returns {() => void}
 */
export function holdPublicRedirect() {
  holds += 1;
  emitHolds();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    emitHolds();
  };
}

/**
 * A hold tied to a screen: `hold()` starts it and returns its release; it is also released when
 * the screen unmounts, so a successful sign in keeps the hold until the screen has navigated away.
 * @returns {() => () => void}
 */
export function useSignInHold() {
  const releaseRef = useRef(/** @type {(() => void) | null} */ (null));
  useEffect(
    () => () => {
      releaseRef.current?.();
      releaseRef.current = null;
    },
    [],
  );
  return useCallback(() => {
    releaseRef.current?.();
    const release = holdPublicRedirect();
    releaseRef.current = release;
    return release;
  }, []);
}

/** @param {() => void} listener */
function subscribeHolds(listener) {
  holdListeners.add(listener);
  return () => holdListeners.delete(listener);
}

/** React hook: true while a sign in flow holds the public redirect. */
export function usePublicRedirectHeld() {
  return useSyncExternalStore(
    subscribeHolds,
    () => holds > 0,
    () => false,
  );
}

/**
 * POST /auth/login, store the session, then GET /auth/me for the name, role and
 * must_change_password. If /auth/me fails after a successful login, the session is kept
 * (the shell then shows a generic greeting).
 * @param {string} identifier  phone number or email
 * @param {string} password
 * @returns {Promise<import('./session').Session | null>}
 */
export async function signIn(identifier, password) {
  const token = await loginRequest({ identifier, password });
  setFromLogin(token);
  markReachable();
  try {
    setProfile(await getMe());
  } catch {
    // Keep the session: the token is valid, only the profile is missing.
  }
  return getSession();
}

/**
 * End the session and clear the TanStack Query cache. There is no backend logout call:
 * the token simply stops being sent and expires on the server after 60 minutes.
 */
export function signOut() {
  clear('logout');
}
