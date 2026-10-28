import { Link } from 'react-router';
import { ArrowRight, Bean, LineChart, MapPin, TrendingUp, Wheat } from 'lucide-react';
import { useCurrentPrices, useForecast, useMarkets } from '@/api/queries';
import { useSession } from '@/auth/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardHero, heroButton, heroOutlineButton } from '@/components/display/DashboardHero';
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

/** A crop's icon, for the card headers. */
const CROP_ICON = { maize: Wheat, beans: Bean };

/**
 * A card title with the crop's icon in a tinted tile.
 * @param {{ crop: 'maize' | 'beans', tone?: 'primary' | 'gold' }} props
 */
function CropTitle({ crop, tone = 'primary' }) {
  const Icon = CROP_ICON[crop] ?? Wheat;
  return (
    <CardTitle as="h3" className="flex items-center gap-2.5">
      <span
        className={
          tone === 'gold'
            ? 'flex size-9 items-center justify-center rounded-lg bg-accent-gold-soft text-accent-gold-text'
            : 'flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary'
        }
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
      {cropLabel(crop)}
    </CardTitle>
  );
}

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
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const market = String(item.market);
          return (
            <li key={market} className="flex flex-col gap-2 rounded-xl bg-canvas px-3 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="flex items-center gap-1.5 font-semibold text-text">
                  <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  {market}
                </span>
                <span className="text-text">
                  <span className="text-xl font-extrabold tracking-tight tabular-nums">
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
        <CropTitle crop={crop} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {body}
        <Button asChild variant="outline" className="mt-auto w-fit">
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
        <p className="w-fit rounded-full bg-accent-gold-soft px-2.5 py-0.5 text-sm font-semibold text-accent-gold-text">
          {inLabelCap(1)}
        </p>
        <p className="text-text">
          <span className="text-4xl font-extrabold tracking-tight tabular-nums">
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
        <CropTitle crop={crop} tone="gold" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {body}
        <Button asChild variant="outline" className="mt-auto w-fit">
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
        <p className="flex items-center gap-1.5 text-text">
          <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
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
      <DashboardHero
        greeting={welcome}
        title="Dashboard"
        headingRef={headingRef}
        description="Market prices, price forecasts and your listings in one place."
        actions={
          <>
            <Button asChild className={heroButton}>
              <Link to="/farmer/prices">
                <LineChart aria-hidden="true" />
                <span>Check prices</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className={heroOutlineButton}>
              <Link to="/farmer/forecast">
                <TrendingUp aria-hidden="true" />
                <span>Get a forecast</span>
              </Link>
            </Button>
          </>
        }
      />

      <ListingsSummary />

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
    </div>
  );
}
