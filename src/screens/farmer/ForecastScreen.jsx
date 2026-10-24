import { useEffect, useId, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertCircle, ArrowRight, CalendarClock, PackagePlus } from 'lucide-react';
import { useCurrentPrices, useForecast, useMarkets } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  explainabilityChart,
  recommendationFor,
  stepAmountText,
  summaryText,
} from '@/lib/forecast';
import { formatKES, formatPct } from '@/lib/format';
import { cropLabel, FORECAST_TEXT, FRESHNESS_FORECAST, PRICE_TEXT } from '@/lib/messages';
import { horizonMonths, inLabel } from '@/lib/relativeTime';
import { isForecastUsable, parseShap } from '@/lib/shapSchema';
import { monthsOlderByMarket } from '@/lib/trends';
import { usePageTitle } from '@/lib/usePageTitle';
import { cleanParams, CROP_OPTIONS, CROPS, DEFAULT_CROP, HORIZON, pickValue } from './params';

/** @typedef {import('@/api/endpoints/forecasts').Forecast} Forecast */
/** @typedef {ReturnType<typeof useForecast>} ForecastQuery */

/**
 * The forecast, or why it cannot be shown.
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
 * "Why the model expects this": the price staircase, drawn from `shap_values` whenever it has the
 * expected shape.
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
  const chart = explainabilityChart(shap);
  const tableRows = chart.steps.map((step) => ({
    id: step.id,
    label: step.label,
    effect: formatPct(step.pct),
    kes: stepAmountText(step),
    after: formatKES(step.to),
  }));
  return (
    <div className="flex flex-col gap-4">
      <ExplainabilityBars
        chart={chart}
        when={inLabel(horizonMonths(forecast.horizon))}
        summary={summaryText(forecast, chart.steps)}
      />
      <details className="rounded-md border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium text-text">
          {FORECAST_TEXT.howToRead}
        </summary>
        <div className="flex flex-col gap-2 px-3 pb-3 text-text">
          {FORECAST_TEXT.howToReadText.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
          <h3 className="mt-1 font-semibold">{FORECAST_TEXT.partsTitle}</h3>
          <dl className="flex flex-col gap-2">
            {chart.steps.map((step) => (
              <div key={step.id}>
                <dt className="font-medium">{step.label}</dt>
                <dd className="text-text-secondary">{step.description}</dd>
              </div>
            ))}
          </dl>
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
              { key: 'kes', header: 'KES per kg', numeric: true },
              { key: 'after', header: 'Price after this part', numeric: true },
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
 *   update: (changes: Record<string, string>) => void,
 * }} props
 */
function ForecastBody({ market, markets, crop, update }) {
  const marketId = useId();
  // Farmers see only the 1 month ahead forecast.
  const selectedQuery = useForecast({ market, crop, horizon: HORIZON });
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

      <Card>
        <CardHeader>
          <CardTitle id="forecast-headline-title">
            {`${cropLabel(crop)} in ${market}, ${inLabel(horizonMonths(HORIZON))}`}
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

/** The explainable 1 month ahead forecast for a market and crop. */
export default function ForecastScreen() {
  const headingRef = usePageTitle('Forecast');
  const [params, setParams] = useSearchParams();
  const marketsQuery = useMarkets();
  const markets = useMemo(() => (marketsQuery.data ?? []).map((m) => m.name), [marketsQuery.data]);

  const crop = pickValue(params.get('crop'), CROPS, DEFAULT_CROP);
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
    body = <ForecastBody market={market} markets={markets} crop={crop} update={update} />;
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
