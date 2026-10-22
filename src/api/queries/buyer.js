/**
 * Hooks for the buyer's browse, checkout, payment and order screens (F3). Reads use queries
 * (infinite queries with offset pages for the lists); writes use useMutation and are never
 * retried automatically. After a successful write the cached order is replaced by the server's
 * answer and the order lists and the waiting count are refreshed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  browseListings,
  cancelOrder,
  createOrder,
  getBuyerMarkets,
  getListing,
  getMyBuyerOrders,
  getOrder,
  payOrder,
} from '../endpoints';
import { ApiError } from '../errors';
import { POLL_WINDOW_MS } from '@/lib/constants';
import { hasOpenPayment } from '@/lib/orderView';
import { nextPollInterval } from '@/lib/polling';
import { queryKeys } from './keys';
import { nextOffset, PAGE_SIZE } from './listings';
import { accountQueryPolicy, retryDelay, shouldRetry, writePolicy } from './policy';

export { useWaitingOrdersCount } from './waitingCount';

/** @typedef {import('../endpoints/orders').Order} Order */
/** @typedef {import('../endpoints/orders').OrderStatus} OrderStatus */
/** @typedef {import('../endpoints/buyerListings').CropType} CropType */
/** @typedef {import('../endpoints/buyerListings').ListingSort} ListingSort */
/** @typedef {import('@tanstack/react-query').QueryClient} QueryClient */

/**
 * @typedef {object} BrowseQueryFilters
 * @property {CropType | null} crop
 * @property {string | null} market
 * @property {string | null} minPrice  a normalised decimal string, or null
 * @property {string | null} maxPrice
 * @property {ListingSort} sort
 */

/** The buyer market list changes only when listings are added or sell out. */
export const BUYER_MARKETS_STALE_TIME_MS = 2 * 60 * 1000;

/**
 * GET /listings/markets: the markets with listings a buyer can buy, with their counts, for the
 * browse filter. Stale after 2 minutes. Under the browse root, so it is refreshed with the
 * browse list after an order.
 */
export function useBuyerMarkets() {
  return useQuery({
    queryKey: queryKeys.buyerMarkets(),
    queryFn: getBuyerMarkets,
    ...accountQueryPolicy,
    staleTime: BUYER_MARKETS_STALE_TIME_MS,
  });
}

/**
 * GET /listings as an infinite query, 20 per page, with the filters in the key. Refetches when
 * the window regains focus.
 * @param {BrowseQueryFilters} filters
 * @param {{ enabled?: boolean }} [options]  disabled while the price filter is invalid
 */
export function useBrowseListings(filters, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.browseListings(filters),
    queryFn: ({ pageParam }) => browseListings({ ...filters, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    refetchOnWindowFocus: true,
    enabled,
    ...accountQueryPolicy,
  });
}

/**
 * GET /listings/{id}: one listing, also when sold out (`available` false).
 * @param {string} id
 */
export function useListing(id) {
  return useQuery({
    queryKey: queryKeys.listing(id),
    queryFn: () => getListing(id),
    enabled: Boolean(id),
    ...accountQueryPolicy,
  });
}

/**
 * Whether an error ends polling: a 4xx answer will not change by asking again (a 401 also
 * clears the session in the client middleware). Network errors and 5xx keep the poll going.
 * @param {unknown} error
 */
function stopsPolling(error) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/**
 * GET /orders/{id}, with polling while a payment prompt is open.
 *
 * - `offsetMs` is the server clock minus the device clock, measured when the response arrived
 *   (`Date.parse(server_time) - dataUpdatedAt`). The countdown uses it so a wrong device clock
 *   does not change the time left.
 * - With `pollWhileWaiting`, the order is refetched every 3 seconds while its payment is open,
 *   for at most 150 seconds from the start of the window (`nextPollInterval`). The window starts
 *   when the screen opens and again with `restartPollWindow()` (a payment started, or "Check
 *   again"). `pollWindowOver` turns true when the window ends with the payment still open.
 * - TanStack Query pauses the interval while the tab is hidden and refetches when it becomes
 *   visible again (stale time 0, refetch on focus). Polling stops on a final state, on unmount
 *   and after a 4xx answer (a 401 also signs out).
 * @param {string} orderId
 * @param {{ pollWhileWaiting?: boolean }} [options]
 */
export function useOrder(orderId, { pollWhileWaiting = false } = {}) {
  const [windowStartedAt, setWindowStartedAt] = useState(() => Date.now());
  const windowRef = useRef(windowStartedAt);
  const [windowOver, setWindowOver] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.order(orderId),
    queryFn: () => getOrder(orderId),
    enabled: Boolean(orderId),
    staleTime: 0,
    retry: shouldRetry,
    retryDelay,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: (q) => {
      if (!pollWhileWaiting || stopsPolling(q.state.error)) return false;
      return nextPollInterval({
        order: q.state.data,
        windowStartedAt: windowRef.current,
        nowMs: Date.now(),
      });
    },
  });

  const { data, dataUpdatedAt } = query;
  const offsetMs = useMemo(() => {
    const server = data ? Date.parse(data.server_time) : Number.NaN;
    return Number.isFinite(server) && dataUpdatedAt > 0 ? server - dataUpdatedAt : 0;
  }, [data, dataUpdatedAt]);

  const open = hasOpenPayment(data);
  useEffect(() => {
    if (!pollWhileWaiting || !open) return undefined;
    const left = Math.max(0, windowStartedAt + POLL_WINDOW_MS - Date.now());
    const id = setTimeout(() => setWindowOver(true), left);
    return () => clearTimeout(id);
  }, [pollWhileWaiting, open, windowStartedAt]);

  const restartPollWindow = useCallback(() => {
    const now = Date.now();
    windowRef.current = now;
    setWindowStartedAt(now);
    setWindowOver(false);
  }, []);

  return { ...query, offsetMs, pollWindowOver: open && windowOver, restartPollWindow };
}

/**
 * GET /orders/mine as an infinite query (20 per page), with the status filter in the key.
 * Refetches when the window regains focus; never polls.
 * @param {{ status: OrderStatus | null }} params
 */
export function useMyBuyerOrders({ status }) {
  return useInfiniteQuery({
    queryKey: queryKeys.buyerOrders({ status }),
    queryFn: ({ pageParam }) => getMyBuyerOrders({ status, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    refetchOnWindowFocus: true,
    ...accountQueryPolicy,
  });
}

/**
 * Put the server's order into its cache entry and refresh the lists, the waiting count and
 * (stock changed) the browse data.
 * @param {QueryClient} client
 * @param {Order} order
 */
function storeOrder(client, order) {
  client.setQueryData(queryKeys.order(order.id), order);
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.buyerOrdersRoot() }),
    client.invalidateQueries({ queryKey: queryKeys.browseRoot() }),
  ]);
}

/** POST /orders. Never retried automatically: a retry could reserve stock twice. */
export function useCreateOrder() {
  const client = useQueryClient();
  return useMutation({
    /** @param {{ listingId: string, quantity: string }} vars */
    mutationFn: (vars) => createOrder(vars),
    ...writePolicy,
    onSuccess: (order) => storeOrder(client, order),
  });
}

/**
 * POST /orders/{id}/pay with the key in `keyRef` (read when the request starts). The key is
 * passed through a ref so it never sits in the mutation's variables. Never retried
 * automatically; the screen decides when the same key is sent again.
 * @param {string} orderId
 * @param {{ current: string | null }} keyRef
 */
export function usePayOrder(orderId, keyRef) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => payOrder(orderId, keyRef.current ?? ''),
    ...writePolicy,
    onSuccess: (result) => {
      const { message: _message, prompt: _prompt, ...order } = result;
      return storeOrder(client, order);
    },
  });
}

/** POST /orders/{id}/cancel. Never retried automatically. */
export function useCancelOrder() {
  const client = useQueryClient();
  return useMutation({
    /** @param {string} orderId */
    mutationFn: (orderId) => cancelOrder(orderId),
    ...writePolicy,
    onSuccess: (order) => storeOrder(client, order),
  });
}
