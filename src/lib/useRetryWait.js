import { useCallback } from 'react';
import { useCountdown } from './useCountdown';
import { useWaitUntil } from './useWaitUntil';
import { COUNTDOWN_MAX_SECONDS } from './waitTime';

/**
 * The wait after a 429, as on the payment screen (prompt 2): up to 120 seconds count down on
 * the button; a longer wait is shown approximately ("about 10 minutes") and ends at a stored
 * timestamp, checked every 15 seconds and on focus (useWaitUntil).
 * @returns {{ remaining: number, active: boolean, longWait: boolean, blocked: boolean, start: (seconds: number) => void }}
 */
export function useRetryWait() {
  const countdown = useCountdown();
  const long = useWaitUntil();
  const { start: startCountdown, reset: resetCountdown } = countdown;
  const { start: startLong, clear: clearLong } = long;

  const start = useCallback(
    (/** @type {number} */ seconds) => {
      if (seconds <= COUNTDOWN_MAX_SECONDS) {
        clearLong();
        startCountdown(seconds);
      } else {
        resetCountdown();
        startLong(seconds);
      }
    },
    [startCountdown, resetCountdown, startLong, clearLong],
  );

  return {
    remaining: countdown.remaining,
    longWait: long.active,
    active: countdown.active,
    blocked: countdown.active || long.active,
    start,
  };
}
