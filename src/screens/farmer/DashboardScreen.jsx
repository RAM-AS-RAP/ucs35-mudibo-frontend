import { Link } from 'react-router';
import { ArrowRight, LineChart, Sprout, TrendingUp } from 'lucide-react';
import { useCurrentPrices, useForecast, useMarkets } from '@/api/queries';
import { useSession } from '@/auth/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeltaTag } from '@/components/display/DeltaTag';
import { PriceChange } from '@/components/display/PriceCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ListingsSummary } from '@/components/listings/ListingsSummary';
import { directionOf } from '@/lib/forecast';
import { formatKES } from '@/lib/format';
import { cropLabel, FORECAST_TEXT, MESSAGES, PRICE_TEXT } from '@/lib/messages';
import { inLabelCap, olderLabel } from '@/lib/relativeTime';
import { isForecastUsable } from '@/lib/shapSchema';
import { monthsOlderByMarket } from '@/lib/trends';
import { usePageTitle } from '@/lib/usePageTitle';
import { CROPS } from './params';

/**
 * "Latest prices" for one crop: every market's price per kg with its change.
 * @param {{ crop: 'maize' | 'beans' }} props
 */
function LatestPricesCard({ crop }) {
  const current = useCurrentPrices(crop);
  const name = cropLabel(crop);
  let body;
  if (current.isPending) {
    body = <LoadingState label={PRICE_TEXT.loadingPrices} rows={1} />;
  } else if (current.isError) {
    body = (
      <ErrorState
        error={current.error}
        title={PRICE_TEXT.errorTitle}
        onRetry={() => current.refetch()}
      />
    );
  } else if ((current.data.items ?? []).length === 0) {
    body = <p className="text-text-secondary">{PRICE_TEXT.empty}</p>;
  } else {
    const items = current.data.items;
    const older = monthsOlderByMarket(items);
    body = (
      <ul className="flex flex-col divide-y divide-border">
        {items.map((item) => {
          const market = String(item.market);
          return (
            <li key={market} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-text">{market}</span>
                <span className="text-text">
                  <span className="text-lg font-bold tabular-nums">
                    {formatKES(/** @type {number} */ (item.avg_price_per_kg))}
                  </span>{' '}
                  <span className="text-text-secondary">{PRICE_TEXT.perKg}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PriceChange changePct={/** @type {number | null} */ (item.change_pct)} />
                {(older[market] ?? 0) > 0 && (
                  <Badge variant="neutral">{olderLabel(older[market])}</Badge>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">{name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {body}
        <Button asChild variant="outline" className="w-fit">
          <Link to={`/farmer/prices?crop=${crop}`}>
            <span>{`See ${name.toLowerCase()} prices`}</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The one month forecast for a crop in the first market, or "Not available yet".
 * @param {{ market: string, crop: 'maize' | 'beans' }} props
 */
function ForecastSnapshotCard({ market, crop }) {
  const query = useForecast({ market, crop, horizon: 'one_month' });
  const name = cropLabel(crop);
  let body;
  if (query.isPending) {
    // A labelled status (not a bare skeleton), so screen readers hear the forecast is loading.
    body = <LoadingState label={FORECAST_TEXT.loading} rows={1} />;
  } else if (query.isError) {
    body = (
      <ErrorState
        error={query.error}
        title={FORECAST_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  } else if (query.data.status === 'unavailable' || !isForecastUsable(query.data.data)) {
    body = (
      <p className="text-text-secondary" data-testid="snapshot-unavailable">
        {FORECAST_TEXT.notAvailableShort}
      </p>
    );
  } else {
    const forecast = query.data.data;
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-text-secondary">{inLabelCap(1)}</p>
        <p className="text-text">
          <span className="text-2xl font-bold tabular-nums">
            {formatKES(forecast.predicted_price)}
          </span>{' '}
          <span className="text-text-secondary">{PRICE_TEXT.perKg}</span>
        </p>
        <DeltaTag
          value={forecast.expected_change_pct}
          direction={directionOf(forecast.expected_change_pct)}
        />
      </div>
    );
  }
  const params = new URLSearchParams({ market, crop, horizon: 'one_month' }).toString();
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">{name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {body}
        <Button asChild variant="outline" className="w-fit">
          <Link to={`/farmer/forecast?${params}`}>
            <span>{`See the ${name.toLowerCase()} forecast`}</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ForecastSnapshot() {
  const markets = useMarkets();
  if (markets.isPending) return <LoadingState label={FORECAST_TEXT.loading} rows={1} />;
  if (markets.isError) {
    return (
      <ErrorState
        error={markets.error}
        title={FORECAST_TEXT.errorTitle}
        onRetry={() => markets.refetch()}
      />
    );
  }
  const first = markets.data[0]?.name;
  if (!first) return <EmptyState title={PRICE_TEXT.emptyTitle} description={PRICE_TEXT.empty} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-text">
          Market: <span className="font-semibold">{first}</span>
        </p>
        <Button asChild variant="link" className="px-1">
          <Link to="/farmer/forecast">
            Change<span className="sr-only"> the market of the forecast</span>
          </Link>
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {CROPS.map((crop) => (
          <ForecastSnapshotCard key={crop} market={first} crop={crop} />
        ))}
      </div>
    </div>
  );
}

/**
 * A section heading with a tinted icon tile.
 * @param {{ id: string, icon: import('react').ComponentType<{ className?: string, 'aria-hidden'?: boolean | 'true' }>, children: import('react').ReactNode }} props
 */
function SectionHeading({ id, icon: Icon, children }) {
  return (
    <h2 id={id} className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-text">
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      {children}
    </h2>
  );
}

/** The farmer's home: latest prices, a forecast snapshot, and a summary of listings and orders. */
export default function DashboardScreen() {
  const headingRef = usePageTitle('Dashboard');
  const session = useSession();
  const welcome = session?.name
    ? MESSAGES.account.welcome(session.name)
    : MESSAGES.account.welcomeGeneric;
  return (
    <div className="flex flex-col gap-8">
      <div className="bg-brand relative overflow-hidden rounded-2xl px-5 py-6 text-on-primary shadow-raised sm:px-8 sm:py-8">
        <Sprout
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 -bottom-10 size-48 text-on-primary opacity-10 sm:size-56"
        />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-lg font-medium text-on-primary-muted">{welcome}</p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-extrabold tracking-tight outline-none sm:text-4xl"
            >
              Dashboard
            </h1>
            <p className="max-w-lg text-on-primary-muted">
              Market prices, price forecasts and your listings in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="bg-card text-primary hover:bg-primary-soft">
              <Link to="/farmer/prices">
                <LineChart aria-hidden="true" />
                <span>Check prices</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-on-primary-muted bg-transparent text-on-primary shadow-none hover:border-card hover:bg-card/10 hover:text-on-primary"
            >
              <Link to="/farmer/forecast">
                <TrendingUp aria-hidden="true" />
                <span>Get a forecast</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <section aria-labelledby="dashboard-prices" className="flex flex-col gap-3">
        <SectionHeading id="dashboard-prices" icon={LineChart}>
          Latest prices
        </SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          {CROPS.map((crop) => (
            <LatestPricesCard key={crop} crop={crop} />
          ))}
        </div>
      </section>

      <section aria-labelledby="dashboard-forecast" className="flex flex-col gap-3">
        <SectionHeading id="dashboard-forecast" icon={TrendingUp}>
          Forecast snapshot
        </SectionHeading>
        <ForecastSnapshot />
      </section>

      <ListingsSummary />
    </div>
  );
}
