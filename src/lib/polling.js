/**
 * Polling of GET /orders/{id} while a payment prompt is open (F3): every 3 seconds, for at most
 * 150 seconds after the payment started (or after "Check again"). TanStack Query also pauses
 * the interval while the tab is hidden (refetchIntervalInBackground is off).
 */
import { POLL_INTERVAL_MS, POLL_WINDOW_MS } from './constants';
import { hasOpenPayment } from './orderView';

export { POLL_INTERVAL_MS, POLL_WINDOW_MS };

/**
 * The next refetch interval, or false to stop polling.
 * @param {{
 *   order: import('./orderView').OrderLike | null | undefined,
 *   windowStartedAt: number,
 *   nowMs: number,
 * }} params
 * @returns {number | false}
 */
export function nextPollInterval({ order, windowStartedAt, nowMs }) {
  if (!hasOpenPayment(order)) return false;
  if (!(nowMs - windowStartedAt < POLL_WINDOW_MS)) return false;
  return POLL_INTERVAL_MS;
}
