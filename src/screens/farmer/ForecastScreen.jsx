import { useEffect, useId, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertCircle, ArrowRight, CalendarClock, PackagePlus } from 'lucide-react';
import { useCurrentPrices, useForecast, useMarkets } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/display/DataTable';
import { DeltaTag } from '@/components/display/DeltaTag';
import { ExplainabilityBars } from '@/components/display/ExplainabilityBars';
import { FreshnessNote } from '@/components/display/FreshnessNote';
import { PageHeader } from '@/components/display/PageHeader';
import { PriceCard } from '@/components/display/PriceCard';
import { Recommendation } from '@/components/display/Recommendation';
import { Segmented } from '@/components/display/Segmented';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import {
  bagPriceText,
  directionOf,
  explainabilityRows,
  recommendationFor,
  summaryText,
} from '@/lib/forecast';
import { formatKES, formatPct, formatSignedKES } from '@/lib/format';
import { cropLabel, FORECAST_TEXT, FRESHNESS_FORECAST, PRICE_TEXT } from '@/lib/messages';
import { horizonMonths, inLabel, inLabelCap } from '@/lib/relativeTime';
import { isForecastUsable, parseShap } from '@/lib/shapSchema';
import { monthsOlderByMarket } from '@/lib/trends';
import { usePageTitle } from '@/lib/usePageTitle';
import { cn } from '@/lib/utils';
import {
  cleanParams,
  CROP_OPTIONS,
  CROPS,
  DEFAULT_CROP,
  DEFAULT_HORIZON,
  HORIZON_OPTIONS,
  HORIZONS,
  pickValue,
} from './params';

/** @typedef {import('@/api/endpoints/forecasts').Forecast} Forecast */
/** @typedef {ReturnType<typeof useForecast>} ForecastQuery */

/**
 * The selected horizon's forecast, or why it cannot be shown.
 * @param {ForecastQuery} query
 * @returns {{ kind: 'loading' } | { kind: 'error', error: unknown } | { kind: 'unavailable', reason: 'no_forecast' | 'stale' } | { kind: 'unusable' } | { kind: 'ok', forecast: Forecast }}
 */
function forecastState(query) {
  if (query.isPending) return { kind: 'loading' };
  if (query.isError) return { kind: 'error', error: query.error };
  const result = query.data;
  if (result.status === 'unavailable') return { kind: 'unavailable', reason: result.reason };
  if (!isForecastUsable(result.data)) return { kind: 'unusable' };
  return { kind: 'ok', forecast: result.data };
}

/**
 * The current price under an unavailable forecast, when the backend has one.
 * @param {{ market: string, crop: 'maize' | 'beans' }} props
 */
function CurrentPriceFallback({ market, crop }) {
  const current = useCurrentPrices(crop);
  if (!current.isSuccess) return null;
  const items = current.data.items ?? [];
  const item = items.find((i) => i.market === market);
  if (!item) return null;
  const older = monthsOlderByMarket(items);
  return (
    <PriceCard
      market={market}
      pricePerKg={/** @type {number} */ (item.avg_price_per_kg)}
      changePct={/** @type {number | null} */ (item.change_pct)}
      monthsOlder={older[market] ?? 0}
    />
  );
}

/**
 * @param {{ reason: 'no_forecast' | 'stale', market: string, crop: 'maize' | 'beans' }} props
 */
function Unavailable({ reason, market, crop }) {
  const cropName = cropLabel(crop).toLowerCase();
  const message =
    reason === 'stale'
      ? FORECAST_TEXT.stale(market, cropName)
      : FORECAST_TEXT.noForecast(market, cropName);
  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        data-reason={reason}
        className="flex items-start gap-3 rounded-xl border border-border bg-neutral-bg p-4 text-neutral-text"
      >
        <CalendarClock aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <p>{message}</p>
      </div>
      <CurrentPriceFallback market={market} crop={crop} />
      <Button asChild variant="outline" className="w-fit">
        <Link to={`/farmer/prices?crop=${crop}`}>
          <span>{`See ${cropName} prices`}</span>
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

/**
 * The headline: predicted price, bag price, expected change with its direction, and the caption.
 * @param {{ forecast: Forecast }} props
 */
function Headline({ forecast }) {
  const months = horizonMonths(forecast.horizon);
  const bag = bagPriceText(forecast.predicted_price);
  return (
    <div className="flex flex-col gap-2" data-testid="forecast-headline">
      <p className="flex flex-wrap items-baseline gap-x-2 text-text">
        <span className="text-4xl font-bold tabular-nums">
          {formatKES(forecast.predicted_price)}
        </span>
        <span className="text-lg text-text-secondary">{PRICE_TEXT.perKg}</span>
      </p>
      {bag && <p className="text-text-secondary">{bag}</p>}
      <DeltaTag
        value={forecast.expected_change_pct}
        direction={directionOf(forecast.expected_change_pct)}
        className="text-base"
      />
      <p className="text-text-secondary">
        {FORECAST_TEXT.caption(formatKES(forecast.origin_price), inLabel(months))}
      </p>
    </div>
  );
}

/**
 * One card of the horizon strip: selectable, the selected one outlined with aria-current.
 * @param {{ horizon: 'one_month' | 'two_month', query: ForecastQuery, selected: boolean, onSelect: () => void }} props
 */
function HorizonCard({ horizon, query, selected, onSelect }) {
  const state = forecastState(query);
  let body;
  if (state.kind === 'loading') {
    body = <Skeleton className="h-6 w-24" />;
  } else if (state.kind === 'ok') {
    body = (
      <>
        <span className="text-xl font-bold text-text tabular-nums">
          {formatKES(state.forecast.predicted_price)}
        </span>
        <DeltaTag
          value={state.forecast.expected_change_pct}
          direction={directionOf(state.forecast.expected_change_pct)}
        />
      </>
    );
  } else if (state.kind === 'error') {
    body = (
      <span className="inline-flex items-center gap-1 text-text-secondary">
        <AlertCircle aria-hidden="true" className="size-4" />
        <span>Could not load</span>
      </span>
    );
  } else {
    body = <span className="text-text-secondary">{FORECAST_TEXT.notAvailableShort}</span>;
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      data-horizon={horizon}
      className={cn(
        'flex min-h-11 flex-col items-start gap-1.5 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-canvas',
        selected ? 'border-primary ring-2 ring-primary' : 'border-border',
      )}
    >
      <span className="font-semibold text-text">{inLabelCap(horizonMonths(horizon))}</span>
      {body}
    </button>
  );
}

/**
 * "Why the model expects this": the bars, drawn from `shap_values` whenever it has the expected shape.
 * @param {{ forecast: Forecast }} props
 */
function Explanation({ forecast }) {
  const shap = parseShap(forecast.shap_values);
  if (!shap) {
    return (
      <p className="flex items-start gap-2 text-text-secondary" data-testid="explanation-fallback">
        <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <span>{FORECAST_TEXT.explanationUnavailable}</span>
      </p>
    );
  }
  const { rows, typical } = explainabilityRows(shap);
  const tableRows = [
    {
      id: 'typical',
      label: typical.label,
      effect: formatPct(typical.pct),
      kes: '',
    },
    ...rows.map((row) => ({
      id: row.label,
      label: `${row.label} (${row.word})`,
      effect: formatPct(row.pct),
      kes: formatSignedKES(row.kesImpact),
    })),
  ];
  return (
    <div className="flex flex-col gap-4">
      <ExplainabilityBars
        rows={rows}
        typical={typical}
        expectedChangePct={forecast.expected_change_pct}
        predictedPrice={forecast.predicted_price}
        summary={summaryText(forecast, rows)}
      />
      <p className="text-sm text-text-secondary">{FORECAST_TEXT.barsNote}</p>
      <details className="rounded-md border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium text-text">
          {FORECAST_TEXT.howToRead}
        </summary>
        <div className="flex flex-col gap-2 px-3 pb-3 text-text">
          {FORECAST_TEXT.howToReadText.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
        </div>
      </details>
      <details className="rounded-md border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium text-text">
          {FORECAST_TEXT.seeNumbers}
        </summary>
        <div className="px-3 pb-3">
          <DataTable
            caption="How the model reached the forecast"
            columns={[
              { key: 'label', header: 'Part of the forecast' },
              { key: 'effect', header: 'Effect (percentage points)', numeric: true },
              { key: 'kes', header: 'About KES per kg', numeric: true },
            ]}
            rows={tableRows}
          />
        </div>
      </details>
    </div>
  );
}

/**
 * @param {{
 *   market: string,
 *   markets: string[],
 *   crop: 'maize' | 'beans',
 *   horizon: 'one_month' | 'two_month',
 *   update: (changes: Record<string, string>) => void,
 * }} props
 */
function ForecastBody({ market, markets, crop, horizon, update }) {
  const marketId = useId();
  // Both horizons in parallel; switching only changes which one is shown.
  const one = useForecast({ market, crop, horizon: 'one_month' });
  const two = useForecast({ market, crop, horizon: 'two_month' });
  const selectedQuery = horizon === 'one_month' ? one : two;
  const state = forecastState(selectedQuery);
  const forecast = state.kind === 'ok' ? state.forecast : null;
  const recommendation = forecast
    ? recommendationFor(forecast.expected_change_pct, forecast.horizon)
    : null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={marketId} className="text-sm font-medium text-text-secondary">
            Market
          </label>
          <select
            id={marketId}
            value={market}
            onChange={(event) => update({ market: event.target.value })}
            className="min-h-11 w-full rounded-md border border-input bg-card px-3 text-base text-text"
          >
            {markets.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <Segmented
          legend="Crop"
          name="crop"
          options={CROP_OPTIONS}
          value={crop}
          onChange={(value) => update({ crop: value })}
        />
      </div>
      <Segmented
        legend="Forecast for"
        name="horizon"
        options={HORIZON_OPTIONS}
        value={horizon}
        onChange={(value) => update({ horizon: value })}
      />

      <Card>
        <CardHeader>
          <CardTitle id="forecast-headline-title">
            {`${cropLabel(crop)} in ${market}, ${inLabel(horizonMonths(horizon))}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {state.kind === 'loading' && <LoadingState label={FORECAST_TEXT.loading} rows={1} />}
          {state.kind === 'error' && (
            <ErrorState
              error={state.error}
              title={FORECAST_TEXT.errorTitle}
              onRetry={() => selectedQuery.refetch()}
            />
          )}
          {state.kind === 'unavailable' && (
            <Unavailable reason={state.reason} market={market} crop={crop} />
          )}
          {state.kind === 'unusable' && (
            <p className="text-text-secondary">{FORECAST_TEXT.forecastUnusable}</p>
          )}
          {forecast && <Headline forecast={forecast} />}
        </CardContent>
      </Card>

      <section aria-labelledby="horizon-strip" className="flex flex-col gap-2">
        <h2 id="horizon-strip" className="text-lg font-semibold text-text">
          Compare the forecasts
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <HorizonCard
            horizon="one_month"
            query={one}
            selected={horizon === 'one_month'}
            onSelect={() => update({ horizon: 'one_month' })}
          />
          <HorizonCard
            horizon="two_month"
            query={two}
            selected={horizon === 'two_month'}
            onSelect={() => update({ horizon: 'two_month' })}
          />
        </div>
      </section>

      {forecast && recommendation && (
        <div className="flex flex-col gap-3">
          <Recommendation
            tone={recommendation.tone}
            title={recommendation.title}
            body={recommendation.body}
            note={FORECAST_TEXT.uncertainty}
          />
          <FreshnessNote text={FRESHNESS_FORECAST} />
        </div>
      )}

      {forecast && (
        <Card>
          <CardHeader>
            <CardTitle id="why-title">{FORECAST_TEXT.whyTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <Explanation forecast={forecast} />
          </CardContent>
        </Card>
      )}

      <section
        aria-labelledby="next-step"
        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
      >
        <h2 id="next-step" className="text-lg font-semibold text-text">
          Next step
        </h2>
        <p className="text-text-secondary">{FORECAST_TEXT.planListingHint}</p>
        <Button asChild className="w-fit">
          <Link to={`/farmer/listings/new?${new URLSearchParams({ crop, market }).toString()}`}>
            <PackagePlus aria-hidden="true" />
            <span>{FORECAST_TEXT.planListing}</span>
          </Link>
        </Button>
      </section>
    </>
  );
}

/** The explainable forecast for a market, crop and horizon. */
export default function ForecastScreen() {
  const headingRef = usePageTitle('Forecast');
  const [params, setParams] = useSearchParams();
  const marketsQuery = useMarkets();
  const markets = useMemo(() => (marketsQuery.data ?? []).map((m) => m.name), [marketsQuery.data]);

  const crop = pickValue(params.get('crop'), CROPS, DEFAULT_CROP);
  const horizon = pickValue(params.get('horizon'), HORIZONS, DEFAULT_HORIZON);
  const market = pickValue(params.get('market'), markets, markets[0] ?? '');

  const marketsKnown = marketsQuery.isSuccess;
  useEffect(() => {
    const next = cleanParams(params, {
      crop: true,
      horizon: true,
      market: marketsKnown ? markets : null,
    });
    if (next) setParams(next, { replace: true });
  }, [params, setParams, marketsKnown, markets]);

  /** @param {Record<string, string>} changes */
  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    setParams(next, { replace: true });
  }

  let body;
  if (marketsQuery.isPending) {
    body = <LoadingState label={FORECAST_TEXT.loading} rows={3} />;
  } else if (marketsQuery.isError) {
    body = (
      <ErrorState
        error={marketsQuery.error}
        title={FORECAST_TEXT.errorTitle}
        onRetry={() => marketsQuery.refetch()}
      />
    );
  } else if (markets.length === 0 || !market) {
    body = <EmptyState title={PRICE_TEXT.emptyTitle} description={PRICE_TEXT.empty} />;
  } else {
    body = (
      <ForecastBody
        market={market}
        markets={markets}
        crop={crop}
        horizon={horizon}
        update={update}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Forecast"
        description="What the price model expects, and how it reached that forecast."
        headingRef={headingRef}
      />
      {body}
      <p className="text-sm text-text-secondary">{FORECAST_TEXT.limitations}</p>
    </div>
  );
}
