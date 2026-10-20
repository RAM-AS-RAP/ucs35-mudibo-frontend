import { ApiError } from '../errors';

/** Prices and forecasts change monthly; five minutes keeps screens quick without going stale. */
export const STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Retry settings. `baseDelayMs` is an object property so tests can shorten the wait without
 * changing how many retries happen.
 */
export const RETRY_POLICY = { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 8000 };

/**
 * No retry for a 4xx answer (it will not change); at most two retries for network errors,
 * timeouts (status 0) and 5xx.
 * @param {number} failureCount  retries already made (TanStack passes 0 after the first failure)
 * @param {unknown} error
 */
export function shouldRetry(failureCount, error) {
  if (!(error instanceof ApiError)) return false;
  if (error.status >= 400 && error.status < 500) return false;
  return failureCount < RETRY_POLICY.maxRetries;
}

/** @param {number} attempt */
export function retryDelay(attempt) {
  return Math.min(RETRY_POLICY.baseDelayMs * 2 ** attempt, RETRY_POLICY.maxDelayMs);
}

/** Options shared by the price and forecast queries. */
export const queryPolicy = Object.freeze({
  staleTime: STALE_TIME_MS,
  retry: shouldRetry,
  retryDelay,
});

/**
 * The farmer's own listings and orders: the same retry rule, but a short stale time because
 * they change when the farmer or a buyer acts.
 */
export const ACCOUNT_STALE_TIME_MS = 30 * 1000;

export const accountQueryPolicy = Object.freeze({
  staleTime: ACCOUNT_STALE_TIME_MS,
  retry: shouldRetry,
  retryDelay,
});

/**
 * Writes (create, edit, remove) are never retried automatically: a retry after a timeout could
 * create a second listing. The mutation is forgotten as soon as it settles, so a photo held in
 * its variables is released.
 */
export const writePolicy = Object.freeze({ retry: false, gcTime: 0 });
