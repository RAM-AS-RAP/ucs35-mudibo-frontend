import { useCallback, useEffect, useRef, useState } from 'react';

/** How often a long wait checks the clock (also on window focus and when the tab is shown). */
export const WAIT_RECHECK_MS = 15000;

/**
 * A long wait (minutes or hours, from Retry-After) that ends at a stored timestamp instead of
 * counting every second. The end is checked every 15 seconds, on window focus and when the tab
 * becomes visible, so a device that slept or a tab that was hidden ends the wait on time. The
 * interval and listeners are removed when the wait ends and on unmount.
 * @param {() => void} [onDone]  called once when the wait ends by itself
 * @returns {{ active: boolean, start: (seconds: number) => void, clear: () => void }}
 */
export function useWaitUntil(onDone) {
  const [until, setUntil] = useState(/** @type {number | null} */ (null));
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (until === null) return undefined;
    const check = () => {
      if (Date.now() < until) return;
      setUntil(null);
      doneRef.current?.();
    };
    const id = setInterval(check, WAIT_RECHECK_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [until]);

  const start = useCallback((/** @type {number} */ seconds) => {
    setUntil(Date.now() + Math.max(1, Math.ceil(seconds)) * 1000);
  }, []);
  const clear = useCallback(() => setUntil(null), []);

  return { active: until !== null, start, clear };
}
