import { useCallback, useEffect, useState } from 'react';

/**
 * Seconds remaining from a start value. Ticks once per second and stops at zero.
 * It only counts: it pauses or blocks nothing else.
 * @param {number} [initialSeconds]
 * @returns {{ remaining: number, active: boolean, start: (seconds: number) => void, reset: () => void }}
 */
export function useCountdown(initialSeconds = 0) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil(initialSeconds)));
  const active = remaining > 0;

  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  const start = useCallback((/** @type {number} */ seconds) => {
    setRemaining(Math.max(0, Math.ceil(seconds)));
  }, []);
  const reset = useCallback(() => setRemaining(0), []);

  return { remaining, active, start, reset };
}
