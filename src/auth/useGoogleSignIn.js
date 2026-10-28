/**
 * The Google button's behaviour (identity v2, prompt 6), used by GoogleSignInButton on the sign
 * in and registration screens.
 *
 * 1. Load Google's script (loadGsi), fetch a nonce (POST /auth/google/nonce), initialise Google
 *    with it and render the button. The nonce lives in a ref only.
 * 2. Refresh the nonce before it expires (expires_in - 60 seconds, at least 30) and when the tab
 *    becomes visible after that deadline (performance.now(), never the wall clock).
 * 3. Google's callback sends `{credential, nonce}` straight to POST /auth/google; both are then
 *    dropped. A second callback while the request runs is ignored.
 * 4. `signed_in` goes to getPostLoginPath(); `role_required` starts the Google flow and opens
 *    /google/role with only `{from}` in router state. While the request runs the phase is
 *    `signing_in`; once the backend accepted Google's answer it is `opening` (with the account's
 *    name for the greeting) until the next screen replaces this one. After SLOW_SIGN_IN_MS
 *    `slow` turns true so the screen can reassure the person.
 * 5. After every callback and every failure a new nonce is fetched before the button shows
 *    again. Nothing is retried automatically. One Tap (prompt) is never used.
 *
 * Every async step checks a generation number, so an unmounted screen, a StrictMode double
 * mount or a replaced nonce never initialises Google twice.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { getGoogleNonce } from '@/api/endpoints';
import { ApiError, getUserMessage } from '@/api/errors';
import { useIsOffline } from '@/lib/connectivity';
import { initializeGoogle, renderGoogleButton } from '@/lib/google/googleClient';
import { loadGsi } from '@/lib/google/loadGsi';
import { MESSAGES } from '@/lib/messages';
import { useRetryWait } from '@/lib/useRetryWait';
import { waitSecondsFrom } from '@/lib/waitTime';
import { signInWithGoogle, useSignInHold } from './auth';
import { fromState, getPostLoginPath } from './redirects';

export const GOOGLE_ROLE_PATH = '/google/role';

/** Refresh the nonce this many seconds before it expires, and never sooner than 30 seconds. */
export const NONCE_REFRESH_MARGIN_SECONDS = 60;
export const NONCE_REFRESH_MIN_SECONDS = 30;

/** After this long without an answer, the sign in counts as slow (a reassuring line appears). */
export const SLOW_SIGN_IN_MS = 8000;

/**
 * Seconds until the nonce should be replaced.
 * @param {number | null | undefined} expiresIn
 */
export function nonceRefreshSeconds(expiresIn) {
  const seconds = typeof expiresIn === 'number' && Number.isFinite(expiresIn) ? expiresIn : 300;
  return Math.max(NONCE_REFRESH_MIN_SECONDS, seconds - NONCE_REFRESH_MARGIN_SECONDS);
}

/**
 * @typedef {'loading' | 'ready' | 'signing_in' | 'opening' | 'retry' | 'load_failed' | 'unavailable'} GooglePhase
 */

/**
 * What the screen opens next, once the backend accepted Google's answer: the account (with the
 * account's name, or null) or the one time role choice.
 * @typedef {{ next: 'account', name: string | null } | { next: 'role' }} GoogleOpening
 */

/**
 * @param {{
 *   preferredRole?: 'farmer' | 'buyer' | null,
 *   from?: unknown,
 *   containerRef: import('react').RefObject<HTMLDivElement | null>,
 * }} options  from: the router state of the screen (only its `from` path is used)
 */
export function useGoogleSignIn({ preferredRole = null, from, containerRef }) {
  const navigate = useNavigate();
  const holdRedirect = useSignInHold();
  const offline = useIsOffline();
  const wait = useRetryWait();
  const startWait = wait.start;
  const [phase, setPhase] = useState(/** @type {GooglePhase} */ ('loading'));
  const [problem, setProblem] = useState(/** @type {string | null} */ (null));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [opening, setOpening] = useState(/** @type {GoogleOpening | null} */ (null));
  const [slow, setSlow] = useState(false);

  // What the async steps read: the latest props and callbacks (updated after each render).
  const latest = useRef({ preferredRole, from, navigate, holdRedirect, startWait, containerRef });
  useEffect(() => {
    latest.current = { preferredRole, from, navigate, holdRedirect, startWait, containerRef };
  });

  // Mutable state of the button cycle. The nonce is here only, never in React state.
  const cycle = useRef({
    alive: false,
    generation: 0,
    /** @type {string | null} */
    nonce: null,
    /** @type {ReturnType<typeof setTimeout> | null} */
    timer: null,
    /** @type {ReturnType<typeof setTimeout> | null} */
    slowTimer: null,
    deadline: 0,
    ready: false,
    inFlight: false,
    unavailable: false,
  });

  const actions = useMemo(() => {
    const c = cycle.current;

    function stopTimer() {
      if (c.timer) clearTimeout(c.timer);
      c.timer = null;
    }

    function stopSlowTimer() {
      if (c.slowTimer) clearTimeout(c.slowTimer);
      c.slowTimer = null;
    }

    /**
     * A failed nonce request or sign in: decide what the person sees.
     * @param {unknown} error
     * @returns {boolean}  true when the button should be prepared again (a new nonce)
     */
    function showFailure(error) {
      if (error instanceof ApiError && error.code === 'google_unavailable') {
        c.unavailable = true;
        setProblem(null);
        setPhase('unavailable');
        return false;
      }
      if (error instanceof ApiError && error.status === 429) {
        const seconds = waitSecondsFrom(error.retryAfter);
        latest.current.startWait(seconds);
        setProblem(MESSAGES.form.tooManyAttempts(seconds));
        setPhase('retry');
        return false;
      }
      setProblem(getUserMessage(error));
      return true;
    }

    /**
     * Fetch a fresh nonce, initialise Google with it and render the button.
     * @param {{ keepProgress?: boolean }} [options]  keepProgress: leave the sign in progress
     *   showing until the new button is ready (right after a successful sign in)
     */
    async function prepare({ keepProgress = false } = {}) {
      if (c.unavailable) return;
      c.generation += 1;
      const generation = c.generation;
      stopTimer();
      c.nonce = null;
      c.ready = false;
      if (!keepProgress) setPhase('loading');

      let answer;
      try {
        answer = await getGoogleNonce();
      } catch (error) {
        if (!c.alive || generation !== c.generation) return;
        // A nonce that could not be fetched leaves the button hidden until "Try again".
        if (showFailure(error)) setPhase('retry');
        return;
      }
      if (!c.alive || generation !== c.generation) return;
      const element = latest.current.containerRef.current;
      if (!element) return;

      try {
        c.nonce = answer.nonce;
        initializeGoogle({
          nonce: answer.nonce,
          onCredential: (credential) => {
            void receive(credential, generation);
          },
        });
        renderGoogleButton(element, { width: element.clientWidth || null });
      } catch {
        c.nonce = null;
        setPhase('load_failed');
        return;
      }
      c.ready = true;
      stopSlowTimer();
      setSlow(false);
      setOpening(null);
      setPhase('ready');

      const seconds = nonceRefreshSeconds(answer.expires_in);
      c.deadline = performance.now() + seconds * 1000;
      c.timer = setTimeout(() => {
        c.timer = null;
        if (c.alive && generation === c.generation && !c.inFlight) void prepare();
      }, seconds * 1000);
    }

    /**
     * Google's callback: send the credential with the nonce it was issued for, once.
     * @param {string | null} credential
     * @param {number} generation  the initialisation that rendered the clicked button
     */
    async function receive(credential, generation) {
      if (c.inFlight || generation !== c.generation || !c.nonce) return;
      const nonce = c.nonce;
      // The nonce is single use: forget it and invalidate this initialisation.
      c.nonce = null;
      c.ready = false;
      c.generation += 1;
      stopTimer();
      if (!credential) {
        void prepare();
        return;
      }

      c.inFlight = true;
      setProblem(null);
      setOpening(null);
      setSlow(false);
      setPhase('signing_in');
      stopSlowTimer();
      c.slowTimer = setTimeout(() => {
        c.slowTimer = null;
        if (c.alive) setSlow(true);
      }, SLOW_SIGN_IN_MS);
      const { holdRedirect: hold, preferredRole: role, from: state, navigate: go } = latest.current;
      const release = hold();
      let again = true;
      let failed = false;
      try {
        const outcome = await signInWithGoogle({
          credential,
          nonce,
          preferredRole: role,
          onProgress: (progress) => {
            if (!c.alive) return;
            setOpening(
              progress.step === 'signed_in'
                ? { next: 'account', name: progress.name }
                : { next: 'role' },
            );
            setPhase('opening');
          },
        });
        if (outcome.status === 'role_required') {
          await go(GOOGLE_ROLE_PATH, { state: fromState(state) });
        } else if (outcome.status === 'code_required') {
          // Not expected for Google; handled like any other AuthResult.
          await go('/login/code', { state: fromState(state) });
        } else {
          await go(getPostLoginPath(outcome.session, state), { replace: true });
        }
      } catch (error) {
        release();
        failed = true;
        stopSlowTimer();
        setSlow(false);
        setOpening(null);
        again = showFailure(error);
      } finally {
        c.inFlight = false;
      }
      // After a success the progress stays on screen while the new nonce loads: normally the
      // next screen replaces this one first, so the button never flashes back.
      if (again && c.alive) void prepare({ keepProgress: !failed });
    }

    /** The tab became visible: replace a nonce whose refresh time has passed. */
    function onVisible() {
      if (!c.alive || !c.ready || c.inFlight) return;
      if (performance.now() >= c.deadline) void prepare();
    }

    return { prepare, onVisible, stopTimer, stopSlowTimer };
  }, []);

  // Load the script and prepare the first button; a remount or "Try again" starts over.
  useEffect(() => {
    const c = cycle.current;
    if (offline || c.unavailable) return undefined;
    c.alive = true;
    c.generation += 1;
    const generation = c.generation;
    loadGsi().then(
      () => {
        if (c.alive && generation === c.generation) void actions.prepare();
      },
      () => {
        if (c.alive && generation === c.generation) setPhase('load_failed');
      },
    );
    return () => {
      c.alive = false;
      c.generation += 1;
      c.nonce = null;
      c.ready = false;
      actions.stopTimer();
      actions.stopSlowTimer();
    };
  }, [offline, loadAttempt, actions]);

  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === 'visible') actions.onVisible();
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [actions]);

  /** "Try again" after the script failed to load. */
  const retryLoad = useCallback(() => {
    setProblem(null);
    setPhase('loading');
    setLoadAttempt((n) => n + 1);
  }, []);

  /** "Try again" after a failed nonce request or a wait. */
  const retry = useCallback(() => {
    setProblem(null);
    void actions.prepare();
  }, [actions]);

  const busy = phase === 'signing_in' || phase === 'opening';
  return {
    phase: offline && !busy && phase !== 'unavailable' ? 'offline' : phase,
    busy,
    opening,
    slow,
    problem,
    wait,
    retry,
    retryLoad,
  };
}
