import { Link } from 'react-router';
import { ArrowRight, Clock } from 'lucide-react';
import { useForecast } from '@/api/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DeltaTag } from '@/components/display/DeltaTag';
import { FreshnessNote } from '@/components/display/FreshnessNote';
import { directionOf } from '@/lib/forecast';
import { formatKES } from '@/lib/format';
import {
  cropLabel,
  FORECAST_TEXT,
  FRESHNESS_PRICES,
  GUIDANCE_TEXT,
  LABEL_LATEST_PRICE,
  PRICE_TEXT,
} from '@/lib/messages';
import { inLabelCap, olderLabel } from '@/lib/relativeTime';
import { isForecastUsable } from '@/lib/shapSchema';
import { cn } from '@/lib/utils';
import { useLatestPrice } from './useLatestPrice';

/**
 * The one month forecast's expected change, or nothing when it is not available.
 * @param {{ crop: 'maize' | 'beans', market: string }} props
 */
function ForecastLine({ crop, market }) {
  const query = useForecast({ market, crop, horizon: 'one_month' });
  if (query.isPending) return <Skeleton className="h-7 w-48" />;
  if (query.isError || query.data.status !== 'ok' || !isForecastUsable(query.data.data)) {
    return <p className="text-sm text-text-secondary">{GUIDANCE_TEXT.forecastUnavailable}</p>;
  }
  const pct = query.data.data.expected_change_pct;
  return (
    <p className="flex flex-wrap items-center gap-2" data-testid="guidance-forecast">
      <span className="text-sm font-medium text-text-secondary">{inLabelCap(1)}</span>
      <DeltaTag value={pct} direction={directionOf(pct)} />
    </p>
  );
}

/**
 * Price guidance beside the listing form: the latest price per kg of the crop in the market,
 * the one month forecast's expected change, where the figures come from, and a link to the
 * forecast. Relative time only (no month, year or date). Loading, unavailable and error states
 * stay quiet: the form works without them.
 * @param {{ crop: 'maize' | 'beans', market: string | null, className?: string }} props
 */
export function PriceGuidance({ crop, market, className }) {
  const { query, price, monthsOlder } = useLatestPrice(crop, market);
  const name = cropLabel(crop);

  let priceBlock;
  if (!market) {
    priceBlock = <p className="text-sm text-text-secondary">{GUIDANCE_TEXT.chooseMarket}</p>;
  } else if (query.isPending) {
    priceBlock = <Skeleton className="h-9 w-40" />;
  } else if (query.isError) {
    priceBlock = <p className="text-sm text-text-secondary">{GUIDANCE_TEXT.priceUnavailable}</p>;
  } else if (price === null) {
    priceBlock = <p className="text-sm text-text-secondary">{GUIDANCE_TEXT.noPrice}</p>;
  } else {
    priceBlock = (
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-secondary">
          <span>{LABEL_LATEST_PRICE}</span>
          {monthsOlder > 0 && (
            <Badge variant="neutral">
              <Clock aria-hidden="true" />
              <span>{olderLabel(monthsOlder)}</span>
            </Badge>
          )}
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2 text-text">
          <span className="text-2xl font-bold tabular-nums">{formatKES(price)}</span>
          <span className="text-text-secondary">{PRICE_TEXT.perKg}</span>
        </p>
      </div>
    );
  }

  const forecastLink = market
    ? `/farmer/forecast?${new URLSearchParams({ market, crop }).toString()}`
    : `/farmer/forecast?${new URLSearchParams({ crop }).toString()}`;

  return (
    <section
      aria-labelledby="price-guidance-title"
      data-testid="price-guidance"
      className={cn('flex flex-col gap-3 rounded-xl border border-border bg-card p-4', className)}
    >
      <h2 id="price-guidance-title" className="text-lg font-semibold text-text">
        {GUIDANCE_TEXT.title}
        <span className="sr-only">{market ? ` for ${name} in ${market}` : ` for ${name}`}</span>
      </h2>
      {market && (
        <p className="text-sm font-medium text-text">
          {name} in {market}
        </p>
      )}
      {priceBlock}
      {market && <ForecastLine crop={crop} market={market} />}
      <FreshnessNote text={FRESHNESS_PRICES} />
      <p className="text-text">{FORECAST_TEXT.planListingHint}</p>
      <Button asChild variant="link" className="w-fit px-0">
        <Link to={forecastLink}>
          <span>{GUIDANCE_TEXT.seeForecast}</span>
          <span className="sr-only">{market ? ` for ${name} in ${market}` : ` for ${name}`}</span>
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}
