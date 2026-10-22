import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, updated when it changes. Without matchMedia (very old
 * browsers) it answers false.
 * @param {string} query  for example "(min-width: 640px)"
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (/** @type {() => void} */ onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener?.('change', onChange);
      return () => list.removeEventListener?.('change', onChange);
    },
    [query],
  );
  const read = useCallback(
    () =>
      typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
    [query],
  );
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Tailwind's `sm` breakpoint: tables from 640 px, stacked cards below. */
export const WIDE_QUERY = '(min-width: 640px)';
