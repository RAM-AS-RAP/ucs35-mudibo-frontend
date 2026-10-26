/**
 * How long a buyer has to wait after a 429 (identity v2, prompt 2). The Retry-After header is
 * parsed by parseRetryAfter (src/api/errors.js) into ApiError.retryAfter; a missing header
 * means 60 seconds.
 */
import { parseRetryAfter } from '@/api/errors';

/** Seconds to wait when a 429 has no Retry-After header. */
export const DEFAULT_WAIT_SECONDS = 60;

/** Waits up to this many seconds count down on the button; longer ones are shown approximately. */
export const COUNTDOWN_MAX_SECONDS = 120;

/**
 * Seconds to wait from a Retry-After value: the parsed number of seconds (ApiError.retryAfter)
 * or the raw header. Missing, zero or unreadable values give 60 seconds.
 * @param {number | string | null | undefined} retryAfter
 * @returns {number}
 */
export function waitSecondsFrom(retryAfter) {
  const seconds = typeof retryAfter === 'string' ? parseRetryAfter(retryAfter) : retryAfter;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds)
    : DEFAULT_WAIT_SECONDS;
}

/**
 * A wait in words: "N seconds" under 90 seconds, "about N minutes" under 90 minutes (rounded
 * up), else "about N hours" (rounded up). Never zero or negative: the minimum is "1 second".
 * @param {number} seconds
 * @returns {string}
 */
export function formatWait(seconds) {
  const s = Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 1;
  if (s < 90) return s === 1 ? '1 second' : `${s} seconds`;
  const minutes = Math.ceil(s / 60);
  if (minutes < 90) return `about ${minutes} minutes`;
  return `about ${Math.ceil(s / 3600)} hours`;
}
