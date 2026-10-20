import { useCurrentPrices } from '@/api/queries';
import { monthsOlderByMarket } from '@/lib/trends';

/**
 * The latest price per kg of a crop in a market, from GET /prices/current (cached and shared
 * with the price screens). `price` is null while loading, on an error, or when the market has
 * no price. `monthsOlder` counts how far this market lags the newest market.
 * @param {'maize' | 'beans'} crop
 * @param {string | null} market
 */
export function useLatestPrice(crop, market) {
  const query = useCurrentPrices(crop, { enabled: Boolean(market) });
  const items = query.data?.items ?? [];
  const item = market ? items.find((i) => i.market === market) : undefined;
  const raw = item?.avg_price_per_kg;
  const price = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
  const monthsOlder = item ? (monthsOlderByMarket(items)[String(item.market)] ?? 0) : 0;
  return { query, price, monthsOlder };
}
