/**
 * Startup revalidation. A session restored from sessionStorage may have been revoked (password
 * changed elsewhere, account disabled), so GET /auth/me runs once before protected routes render.
 * - 200: role, name and must_change_password are refreshed from the response.
 * - 401: the session is cleared with the reason "expired" (the client middleware does this).
 * - Network failure or timeout: the session is kept and the offline banner explains why.
 * - No answer after 8 seconds: stop waiting and render; the request may still finish later.
 */
import { useSyncExternalStore } from 'react';
import { getMe } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { markReachable, markUnreachable } from '@/lib/connectivity';
import {
  clear,
  getRestoreId,
  getSession,
  setProfile,
  subscribe as subscribeSession,
} from './session';

export const REVALIDATION_TIMEOUT_MS = 8_000;

/** The restore id that has finished (or given up) revalidation. */
let settledId = 0;
/** @type {{ id: number, promise: Promise<void> } | null} */
let running = null;
/** @type {Set<() => void>} */
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

/** True while a restored session still waits for its revalidation. */
export function isRevalidationPending() {
  const id = getRestoreId();
  return id !== 0 && id !== settledId && Boolean(getSession()) && !getSession()?.isDevFake;
}

/**
 * Start (once per restored session) and return the revalidation.
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<void>}
 */
export function revalidateSession({ timeoutMs = REVALIDATION_TIMEOUT_MS } = {}) {
  const id = getRestoreId();
  if (!isRevalidationPending()) return Promise.resolve();
  if (running && running.id === id) return running.promise;

  const check = getMe().then(
    (me) => {
      markReachable();
      if (getRestoreId() === id) setProfile(me);
    },
    (error) => {
      if (!(error instanceof ApiError)) return;
      if (error.status === 401) {
        // The middleware already cleared the session; make sure, without a second flash change.
        if (getSession() && getRestoreId() === id) clear('expired');
      } else if (error.code === 'network_error' || error.code === 'timeout') {
        markUnreachable();
      }
    },
  );
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const giveUp = new Promise((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  const promise = Promise.race([check, giveUp]).then(() => {
    clearTimeout(timer);
    settledId = id;
    running = null;
    emit();
  });
  running = { id, promise };
  return promise;
}

/** @param {() => void} listener */
function subscribe(listener) {
  listeners.add(listener);
  const unsubscribe = subscribeSession(listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}

/** React hook: true while protected routes should wait for the revalidation. */
export function useRevalidationPending() {
  return useSyncExternalStore(subscribe, isRevalidationPending, () => false);
}
