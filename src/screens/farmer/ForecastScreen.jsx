import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  ChartLine,
  ChevronDown,
  Lightbulb,
  MapPin,
  PackagePlus,
  SlidersHorizontal,
  Table2,
  TrendingUp,
} from 'lucide-react';
import { useCurrentPrices, useForecast, useMarkets } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/display/DataTable';
import { DeltaTag } from '@/components/display/DeltaTag';
import { ExplainabilityBars } from '@/components/display/ExplainabilityBars';
import { PageHero } from '@/components/display/DashboardHero';
import { PriceCard } from '@/components/display/PriceCard';
import { Segmented } from '@/components/display/Segmented';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import {
  bagPriceText,
  directionOf,
  explainabilityChart,
  stepAmountText,
  summaryText,
} from '@/lib/forecast';
import { formatKES, formatPct } from '@/lib/format';
import { cropLabel, FORECAST_TEXT, PRICE_TEXT } from '@/lib/messages';
import { horizonMonths, inLabel, inLabelCap } from '@/lib/relativeTime';
import { isForecastUsable, parseShap } from '@/lib/shapSchema';
import { monthsOlderByMarket } from '@/lib/trends';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  clearForecastRequest,
  getForecastRequest,
  requestForecast,
  setWhyOpen,
  useForecastRequest,
} from './forecastRequest';
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
    <div className="flex flex-col gap-1.5" data-testid="forecast-headline">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex items-baseline gap-x-1.5">
          <span className="text-4xl font-extrabold tracking-tight tabular-nums">
            {formatKES(forecast.predicted_price)}
          </span>
          <span className="text-on-primary-muted">{PRICE_TEXT.perKg}</span>
        </p>
        <DeltaTag
          value={forecast.expected_change_pct}
          direction={directionOf(forecast.expected_change_pct)}
          tone="inverse"
          className="rounded-full px-2.5"
        />
      </div>
      {bag && <p className="text-sm text-on-primary-muted">{bag}</p>}
      <p className="max-w-md text-sm text-on-primary-muted">
        {FORECAST_TEXT.caption(formatKES(forecast.origin_price), inLabel(months))}
      </p>
    </div>
  );
}

/** Arrow between the latest price and the forecast, by the forecast's direction. */
const DIRECTION_ARROW = { rise: ArrowUpRight, fall: ArrowDownRight, flat: ArrowRight };

/**
 * The latest price and what the model expects, one above the other (display only: both are the
 * server's numbers).
 * @param {{ forecast: Forecast }} props
 */
function FromTo({ forecast }) {
  const Arrow = DIRECTION_ARROW[directionOf(forecast.expected_change_pct)] ?? ArrowRight;
  const months = horizonMonths(forecast.horizon);
  return (
    <dl className="flex w-fit items-center gap-4 rounded-xl bg-card/10 px-4 py-3 ring-1 ring-card/20">
      <div className="flex flex-col">
        <dt className="text-xs font-medium tracking-wide text-on-primary-muted uppercase">
          Latest
        </dt>
        <dd className="text-lg font-bold tabular-nums">{formatKES(forecast.origin_price)}</dd>
      </div>
      <Arrow aria-hidden="true" className="size-5 shrink-0 text-on-primary-muted" />
      <div className="flex flex-col">
        <dt className="text-xs font-medium tracking-wide text-on-primary-muted uppercase">
          {inLabelCap(months)}
        </dt>
        <dd className="text-lg font-bold tabular-nums">{formatKES(forecast.predicted_price)}</dd>
      </div>
    </dl>
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
    <div className="flex flex-col gap-3">
      <ExplainabilityBars
        className="mb-2"
        chart={chart}
        when={inLabel(horizonMonths(forecast.horizon))}
        summary={summaryText(forecast, chart.steps)}
      />
      <details className="group rounded-xl border border-border bg-card open:bg-canvas">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 font-semibold text-text [&::-webkit-details-marker]:hidden">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <BookOpen aria-hidden="true" className="size-4" />
          </span>
          <span>{FORECAST_TEXT.howToRead}</span>
          <ChevronDown
            aria-hidden="true"
            className="ml-auto size-5 text-text-secondary transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="flex flex-col gap-2 px-4 pb-4 text-text">
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
      <details className="group rounded-xl border border-border bg-card open:bg-canvas">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 font-semibold text-text [&::-webkit-details-marker]:hidden">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Table2 aria-hidden="true" className="size-4" />
          </span>
          <span>{FORECAST_TEXT.seeNumbers}</span>
          <ChevronDown
            aria-hidden="true"
            className="ml-auto size-5 text-text-secondary transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="px-4 pb-4">
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
 * The selection, the request button, and (only after the farmer asks) the forecast. The
 * explanation opens only from its own button. Changing the market or crop clears both, so a
 * shown forecast always matches the selection. The request is kept in `forecastRequest.js`, so
 * it is still there after a visit to another tab.
 * @param {{
 *   market: string,
 *   markets: string[],
 *   crop: 'maize' | 'beans',
 *   update: (changes: Record<string, string>) => void,
 * }} props
 */
function ForecastBody({ market, markets, crop, update }) {
  const marketId = useId();
  const explanationId = useId();
  // The selection the farmer asked a forecast for, and whether the explanation is open.
  const saved = useForecastRequest();
  const requested = saved?.market === market && saved?.crop === crop;
  const whyOpen = requested && saved.whyOpen;

  // Farmers see only the 1 month ahead forecast, and nothing is fetched before the click.
  const selectedQuery = useForecast({ market, crop, horizon: HORIZON, enabled: requested });
  const state = requested ? forecastState(selectedQuery) : null;
  const forecast = state?.kind === 'ok' ? state.forecast : null;

  /** @param {Record<string, string>} changes */
  function changeSelection(changes) {
    clearForecastRequest();
    update(changes);
  }

  return (
    <>
      <section
        aria-labelledby="forecast-choose"
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5"
      >
        <h2
          id="forecast-choose"
          className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-text"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <SlidersHorizontal aria-hidden="true" className="size-5" />
          </span>
          Choose a market and crop
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1.5 sm:w-56">
            <label htmlFor={marketId} className="text-sm font-medium text-text-secondary">
              Market
            </label>
            <select
              id={marketId}
              value={market}
              onChange={(event) => changeSelection({ market: event.target.value })}
              className="min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base text-text"
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
            onChange={(value) => changeSelection({ crop: value })}
          />
          <Button
            type="button"
            className="min-h-11 w-full sm:w-fit"
            disabled={requested && selectedQuery.isFetching}
            onClick={() => requestForecast(market, crop)}
          >
            <ChartLine aria-hidden="true" />
            <span>{FORECAST_TEXT.request}</span>
          </Button>
        </div>
      </section>

      {!state && (
        <EmptyState
          icon={TrendingUp}
          title="Your forecast appears here"
          description={`Choose a market and crop, then select "${FORECAST_TEXT.request}".`}
        />
      )}

      {state && forecast && (
        <section
          aria-labelledby="forecast-headline-title"
          className="bg-brand relative overflow-hidden rounded-2xl text-on-primary shadow-raised"
        >
          <div aria-hidden="true" className="bg-dot-grid pointer-events-none absolute inset-0" />
          <div className="relative flex flex-col gap-4 p-5 sm:p-6">
            <h2
              id="forecast-headline-title"
              className="flex items-center gap-2 text-sm font-semibold text-on-primary-muted"
            >
              <MapPin aria-hidden="true" className="size-4 shrink-0" />
              {`${cropLabel(crop)} in ${market}, ${inLabel(horizonMonths(HORIZON))}`}
            </h2>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <Headline forecast={forecast} />
              <FromTo forecast={forecast} />
            </div>
          </div>
          <div className="relative border-t border-card/15 px-3 py-2 sm:px-4">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 w-full justify-between text-on-primary hover:bg-card/10 hover:text-on-primary focus-visible:ring-card sm:w-fit sm:justify-start"
              aria-expanded={whyOpen}
              aria-controls={whyOpen ? explanationId : undefined}
              onClick={() => setWhyOpen(!whyOpen)}
            >
              <span className="flex items-center gap-2">
                <Lightbulb aria-hidden="true" />
                <span>{FORECAST_TEXT.whyTitle}</span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className={whyOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
              />
            </Button>
          </div>
        </section>
      )}

      {state && !forecast && (
        <Card>
          <CardHeader>
            <CardTitle id="forecast-headline-title">
              {`${cropLabel(crop)} in ${market}, ${inLabel(horizonMonths(HORIZON))}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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
          </CardContent>
        </Card>
      )}

      {forecast && whyOpen && (
        <Card id={explanationId}>
          <CardHeader>
            <CardTitle id="why-title" className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent-gold-soft text-accent-gold-text">
                <Lightbulb aria-hidden="true" className="size-5" />
              </span>
              {FORECAST_TEXT.whyTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Explanation forecast={forecast} />
          </CardContent>
        </Card>
      )}

      {forecast && (
        <section
          aria-labelledby="next-step"
          className="flex flex-col gap-4 rounded-2xl border border-border border-l-4 border-l-accent-gold bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-gold-soft text-accent-gold-text">
              <PackagePlus aria-hidden="true" className="size-5" />
            </span>
            <div className="flex flex-col gap-0.5">
              <h2 id="next-step" className="text-lg font-bold text-text">
                Next step
              </h2>
              <p className="text-text-secondary">{FORECAST_TEXT.planListingHint}</p>
            </div>
          </div>
          <Button asChild className="w-full sm:w-fit">
            <Link to={`/farmer/listings/new?${new URLSearchParams({ crop, market }).toString()}`}>
              <PackagePlus aria-hidden="true" />
              <span>{FORECAST_TEXT.planListing}</span>
            </Link>
          </Button>
        </section>
      )}
    </>
  );
}

/** The explainable 1 month ahead forecast for a market and crop. */
export default function ForecastScreen() {
  const headingRef = usePageTitle('Forecast');
  const [params, setParams] = useSearchParams();
  const marketsQuery = useMarkets();
  const markets = useMemo(() => (marketsQuery.data ?? []).map((m) => m.name), [marketsQuery.data]);

  // Back from another tab through a link without a selection (the sidebar): show the forecast
  // the farmer requested before. Read once when the screen opens, so a request made here does not
  // rewrite the URL.
  const [saved] = useState(getForecastRequest);
  const current = useForecastRequest();
  const stillCurrent = saved?.market === current?.market && saved?.crop === current?.crop;
  const restore =
    saved && stillCurrent && !params.has('market') && !params.has('crop') ? saved : null;
  const crop = pickValue(params.get('crop') ?? restore?.crop ?? null, CROPS, DEFAULT_CROP);
  const market = pickValue(
    params.get('market') ?? restore?.market ?? null,
    markets,
    markets[0] ?? '',
  );

  const marketsKnown = marketsQuery.isSuccess;
  useEffect(() => {
    // Write the restored selection into the URL, so the controls and links keep it.
    if (!restore || !marketsKnown || !markets.includes(restore.market)) return;
    const next = new URLSearchParams(params);
    next.set('market', restore.market);
    next.set('crop', restore.crop);
    setParams(next, { replace: true });
  }, [restore, marketsKnown, markets, params, setParams]);
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
      <PageHero
        title="Forecast"
        description="Choose a market and crop, then request what the price model expects."
        icon={TrendingUp}
        headingRef={headingRef}
      />
      {body}
    </div>
  );
}
