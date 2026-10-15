/**
 * Connectivity, for the offline banner: the browser's online flag, plus "the API could not be
 * reached" when a request failed at the network level while the browser reports online.
 */
import { useSyncExternalStore } from 'react';

let unreachable = false;
/** @type {Set<() => void>} */
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

/** A request failed with network_error or timeout. */
export function markUnreachable() {
  if (unreachable) return;
  unreachable = true;
  emit();
}

/** A request succeeded. */
export function markReachable() {
  if (!unreachable) return;
  unreachable = false;
  emit();
}

/** @param {() => void} listener */
function subscribe(listener) {
  listeners.add(listener);
  const onOnline = () => markReachable();
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  window.addEventListener('online', onOnline);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
    window.removeEventListener('online', onOnline);
  };
}

/** @returns {'online' | 'offline' | 'unreachable'} */
function getStatus() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  return unreachable ? 'unreachable' : 'online';
}

/** React hook: 'online', 'offline' (no connection) or 'unreachable' (the API did not answer). */
export function useConnectivity() {
  return useSyncExternalStore(subscribe, getStatus, () => 'online');
}

/** React hook: true while the device reports no connection. */
export function useIsOffline() {
  return useConnectivity() === 'offline';
}
