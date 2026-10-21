/**
 * TanStack Query hooks over the endpoint functions. Screens use these, never the endpoints
 * directly. The session store clears the query cache on logout.
 */
import { useQueries, useQuery } from '@tanstack/react-query';
import { getCurrentPrices, getForecast, getMarkets, getPriceTrends } from '../endpoints';
import { queryKeys } from './keys';
import { queryPolicy } from './policy';

export { queryKeys } from './keys';
export {
  ACCOUNT_STALE_TIME_MS,
  accountQueryPolicy,
  RETRY_POLICY,
  STALE_TIME_MS,
  queryPolicy,
  retryDelay,
  shouldRetry,
  writePolicy,
} from './policy';

/** GET /markets: the markets that have price data. */
export function useMarkets() {
  return useQuery({ queryKey: queryKeys.markets(), queryFn: getMarkets, ...queryPolicy });
}

/**
 * GET /prices/current for one crop.
 * @param {'maize' | 'beans'} crop
 * @param {{ enabled?: boolean }} [options]
 */
export function useCurrentPrices(crop, { enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.currentPrices(crop),
    queryFn: () => getCurrentPrices(crop),
    enabled,
    ...queryPolicy,
  });
}

/**
 * GET /prices/trends for each market, in parallel.
 * @param {{ markets: string[], crop: 'maize' | 'beans', months: number, enabled?: boolean }} params
 */
export function usePriceTrends({ markets, crop, months, enabled = true }) {
  return useQueries({
    queries: markets.map((market) => ({
      queryKey: queryKeys.priceTrends({ market, crop, months }),
      queryFn: () =>
        getPriceTrends({
          market: /** @type {import('../endpoints/prices').MarketName} */ (market),
          crop,
          months,
        }),
      enabled,
      ...queryPolicy,
    })),
  });
}

/**
 * GET /forecasts. The data is `{ status: 'ok', data }` or `{ status: 'unavailable', reason }`.
 * @param {{ market: string | null | undefined, crop: 'maize' | 'beans', horizon: 'one_month' | 'two_month' }} params
 */
export function useForecast({ market, crop, horizon }) {
  return useQuery({
    queryKey: queryKeys.forecast({ market: market ?? '', crop, horizon }),
    queryFn: () =>
      getForecast({
        market: /** @type {import('../endpoints/forecasts').MarketName} */ (market),
        crop,
        horizon,
      }),
    enabled: Boolean(market),
    ...queryPolicy,
  });
}

export {
  findCachedListing,
  fetchMyListing,
  invalidateListingData,
  nextOffset,
  PAGE_SIZE,
  useCreateListing,
  useMyListing,
  useMyListingCount,
  useMyListings,
  useMyOrderCount,
  useMyOrders,
  useRemoveListing,
  useUpdateListing,
} from './listings';

export {
  useBrowseListings,
  useBuyerMarkets,
  useCancelOrder,
  useCreateOrder,
  useListing,
  useMyBuyerOrders,
  useOrder,
  usePayOrder,
  useWaitingOrdersCount,
} from './buyer';
