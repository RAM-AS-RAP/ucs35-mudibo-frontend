/**
 * Sign in and sign out, shared by the login, code, registration and invite screens.
 * Passwords and codes exist only in the arguments and the request body; the registration and
 * challenge tokens only in the in memory flow store (./flow.js). None of them is ever stored,
 * logged, put in a URL, router state or a query key.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  acceptInvite as acceptInviteRequest,
  getMe,
  login as loginRequest,
  registerBuyer,
  registerFarmer,
  resendLoginCode as resendLoginRequest,
  resendRegistrationCode as resendRegistrationRequest,
  verifyLogin as verifyLoginRequest,
  verifyRegistration as verifyRegistrationRequest,
} from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { markReachable } from '@/lib/connectivity';
import { waitSecondsFrom } from '@/lib/waitTime';
import { clearFlow, getFlow, startFlow, updateResend } from './flow';
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

/** @typedef {import('@/api/schema').components['schemas']['AuthResult']} AuthResult */
/**
 * @typedef {{ status: 'signed_in', session: import('./session').Session | null }
 *   | { status: 'code_required' }} SignInOutcome
 */

/**
 * Narrow an AuthResult to `signed_in`: an access token and a role are present.
 * @param {AuthResult | null | undefined} result
 */
function isSignedIn(result) {
  return (
    result?.status === 'signed_in' &&
    typeof result.access_token === 'string' &&
    result.access_token !== '' &&
    typeof result.role === 'string'
  );
}

/**
 * Narrow an AuthResult to `code_required`: a challenge token is present.
 * @param {AuthResult | null | undefined} result
 */
function isCodeRequired(result) {
  return (
    result?.status === 'code_required' &&
    typeof result.challenge_token === 'string' &&
    result.challenge_token !== ''
  );
}

/**
 * Handle any AuthResult, for every role and every endpoint that returns one.
 * - `signed_in`: store the session, load the profile (a failed GET /auth/me keeps the session),
 *   then forget the flow.
 * - `code_required`: start (or replace) the login flow; the screen opens /login/code.
 * Anything else is an unexpected response.
 * @param {AuthResult} result
 * @returns {Promise<SignInOutcome>}
 */
export async function completeAuthResult(result) {
  if (isSignedIn(result)) {
    setFromLogin(result);
    markReachable();
    try {
      setProfile(await getMe());
    } catch {
      // Keep the session: the token is valid, only the profile is missing.
    }
    clearFlow();
    return { status: 'signed_in', session: getSession() };
  }
  if (isCodeRequired(result)) {
    startFlow('login', {
      token: /** @type {string} */ (result.challenge_token),
      emailMasked: result.email_masked ?? '',
      resendAvailableInSeconds: result.resend_available_in,
      codeSent: result.code_sent,
    });
    return { status: 'code_required' };
  }
  throw new ApiError({ status: 200, code: 'unexpected_response' });
}

/** The error of a code step without a flow (a reload or a direct visit). */
function flowLost() {
  return new ApiError({ status: 0, code: 'flow_lost' });
}

/**
 * POST /auth/login, then handle the AuthResult (see completeAuthResult).
 * @param {string} email
 * @param {string} password
 * @returns {Promise<SignInOutcome>}
 */
export async function signIn(email, password) {
  return completeAuthResult(await loginRequest({ email, password }));
}

/**
 * POST /auth/login/verify with the flow's challenge token. challenge_closed ends the flow.
 * @param {string} code
 * @returns {Promise<SignInOutcome>}
 */
export async function verifyLoginCode(code) {
  const flow = getFlow('login');
  if (!flow) throw flowLost();
  let result;
  try {
    result = await verifyLoginRequest({ challengeToken: flow.token, code });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'challenge_closed') clearFlow();
    throw error;
  }
  return completeAuthResult(result);
}

/**
 * The flow store's reaction to a failed resend: a 429 restarts the countdown from Retry-After
 * (resend_cooldown), challenge_closed ends the flow.
 * @param {unknown} error
 */
function afterResendError(error) {
  if (!(error instanceof ApiError)) return;
  if (error.status === 429) updateResend(waitSecondsFrom(error.retryAfter));
  if (error.code === 'challenge_closed') clearFlow();
}

/**
 * POST /auth/login/resend, then restart the countdown from resend_available_in.
 * @returns {Promise<import('@/api/schema').components['schemas']['LoginResendOut']>}
 */
export async function resendLoginCode() {
  const flow = getFlow('login');
  if (!flow) throw flowLost();
  try {
    const answer = await resendLoginRequest({ challengeToken: flow.token });
    updateResend(answer.resend_available_in, { codeSent: answer.code_sent, newCode: true });
    return answer;
  } catch (error) {
    afterResendError(error);
    throw error;
  }
}

/**
 * POST /auth/register/farmer or /buyer with exactly {name, email, password}, then start the
 * register flow. The answer is the same whether or not the email has an account.
 * @param {'farmer' | 'buyer'} role  picks the endpoint; never sent in the body
 * @param {{ name: string, email: string, password: string }} fields
 */
export async function startRegistration(role, { name, email, password }) {
  const request = role === 'farmer' ? registerFarmer : registerBuyer;
  const answer = await request({ name, email, password });
  startFlow('register', {
    token: answer.registration_token,
    emailMasked: answer.email_masked,
    resendAvailableInSeconds: answer.resend_available_in,
    codeSent: true,
  });
}

/**
 * POST /auth/register/verify with the flow's registration token (201 AuthResult).
 * @param {string} code
 * @returns {Promise<SignInOutcome>}
 */
export async function verifyRegistrationCode(code) {
  const flow = getFlow('register');
  if (!flow) throw flowLost();
  const result = await verifyRegistrationRequest({ registrationToken: flow.token, code });
  return completeAuthResult(result);
}

/** POST /auth/register/resend (always 202), then restart the countdown. */
export async function resendRegistration() {
  const flow = getFlow('register');
  if (!flow) throw flowLost();
  try {
    const answer = await resendRegistrationRequest({ registrationToken: flow.token });
    updateResend(answer.resend_available_in, { newCode: true });
    return answer;
  } catch (error) {
    afterResendError(error);
    throw error;
  }
}

/**
 * POST /auth/accept-invite (201 AuthResult). The new admin is signed in with the returned
 * token; `login` is never called afterwards (it would ask for a second code).
 * @param {{ email: string, code: string, password: string }} fields
 * @returns {Promise<SignInOutcome>}
 */
export async function acceptInvitation({ email, code, password }) {
  return completeAuthResult(await acceptInviteRequest({ email, code, password }));
}

/**
 * End the session and clear the TanStack Query cache. There is no backend logout call:
 * the token simply stops being sent and expires on the server (expires_in, 8 hours by default).
 * The flow store is cleared too (session.clear).
 */
export function signOut() {
  clear('logout');
}
