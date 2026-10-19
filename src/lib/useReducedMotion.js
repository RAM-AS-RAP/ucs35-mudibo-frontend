import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** @param {() => void} onChange */
function subscribe(onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener?.('change', onChange);
  return () => media.removeEventListener?.('change', onChange);
}

function getSnapshot() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(QUERY).matches);
}

/** True when the user asked the system for reduced motion (charts then skip their animation). */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
