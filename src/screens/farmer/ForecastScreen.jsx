import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  ChartLine,
  Check,
  ChevronDown,
  Clock,
  Coins,
  Info,
  Lightbulb,
  MapPin,
  PackagePlus,
  Pencil,
  Repeat,
  Table2,
  TrendingUp,
} from 'lucide-react';
import { useCurrentPrices, useForecast, useMarkets } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CROP_ICONS, CropChoice } from '@/components/display/CropChoice';
import { DataTable } from '@/components/display/DataTable';
import { DeltaTag } from '@/components/display/DeltaTag';
import { ExplainabilityBars } from '@/components/display/ExplainabilityBars';
import { PageHero } from '@/components/display/DashboardHero';
import { IconSelect } from '@/components/display/IconSelect';
import { PriceCard } from '@/components/display/PriceCard';
import { StepHeading } from '@/components/display/StepHeading';
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
import { horizonMonths, inLabel, inLabelCap, olderLabel } from '@/lib/relativeTime';
import { isForecastUsable, parseShap } from '@/lib/shapSchema';
import { monthsOlderByMarket } from '@/lib/trends';
import { usePageTitle } from '@/lib/usePageTitle';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { cn } from '@/lib/utils';
import {
  clearForecastRequest,
  getForecastRequest,
  requestForecast,
  setWhyOpen,
  useForecastRequest,
} from './forecastRequest';
import { cleanParams, CROPS, DEFAULT_CROP, HORIZON, pickValue } from './params';

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

/** Arrow between the latest price and the forecast, by the forecast's direction. */
const DIRECTION_ARROW = { rise: ArrowUpRight, fall: ArrowDownRight, flat: ArrowRight };

/**
 * The headline: the path from the latest price to the expected price (each shown once), the
 * expected change with its direction, the bag price and the caption. Display only: every number
 * is the server's.
 * @param {{ forecast: Forecast }} props
 */
function Headline({ forecast }) {
  const months = horizonMonths(forecast.horizon);
  const bag = bagPriceText(forecast.predicted_price);
  const Arrow = DIRECTION_ARROW[directionOf(forecast.expected_change_pct)] ?? ArrowRight;
  return (
    <div className="flex flex-col gap-4" data-testid="forecast-headline">
      <dl className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex flex-col">
          <dt className="text-xs font-medium tracking-wide text-on-primary-muted uppercase">
            Latest
          </dt>
          <dd className="text-xl font-bold tabular-nums">{formatKES(forecast.origin_price)}</dd>
        </div>
        <div aria-hidden="true" className="mb-1.5 flex items-center gap-1 sm:min-w-16 sm:flex-1">
          <span className="hidden h-0.5 flex-1 rounded-full bg-card/30 sm:block" />
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-card/15 ring-1 ring-card/25">
            <Arrow className="size-4" />
          </span>
        </div>
        <div className="flex flex-col">
          <dt className="text-xs font-medium tracking-wide text-on-primary-muted uppercase">
            {inLabelCap(months)}
          </dt>
          <dd className="flex items-baseline gap-x-1.5">
            <span className="text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">
              {formatKES(forecast.predicted_price)}
            </span>
            <span className="text-on-primary-muted">{PRICE_TEXT.perKg}</span>
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <DeltaTag
          value={forecast.expected_change_pct}
          direction={directionOf(forecast.expected_change_pct)}
          tone="inverse"
          className="rounded-full px-2.5"
        />
        {bag && (
          <p className="rounded-full bg-card/10 px-3 py-1 text-sm ring-1 ring-card/20">{bag}</p>
        )}
      </div>
      <p className="max-w-xl text-sm text-on-primary-muted">
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
          {FORECAST_TEXT.howToRead}
          <ChevronDown
            aria-hidden="true"
            className="ml-auto size-5 text-text-secondary transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="flex flex-col gap-2 px-4 pb-4 text-text">
          {FORECAST_TEXT.howToReadText.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
          <h4 className="mt-1 font-semibold">{FORECAST_TEXT.partsTitle}</h4>
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
          {FORECAST_TEXT.seeNumbers}
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
 * The latest price for the selection, under the controls, so a farmer sees where the price is
 * now (and notices a wrong market) before asking. A price, not a forecast: GET /prices/current.
 * Quiet while loading and on errors.
 * @param {{ market: string, crop: 'maize' | 'beans' }} props
 */
function LatestHere({ market, crop }) {
  const current = useCurrentPrices(crop);
  if (current.isPending) return <Skeleton className="h-6 w-56" />;
  if (!current.isSuccess) return null;
  const items = current.data.items ?? [];
  const item = items.find((i) => i.market === market);
  if (!item || item.avg_price_per_kg == null) return null;
  const older = monthsOlderByMarket(items)[market] ?? 0;
  return (
    <p
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary"
      data-testid="forecast-latest-here"
    >
      <span>{FORECAST_TEXT.latestHere(market)}</span>
      <span className="font-semibold text-text tabular-nums">
        {formatKES(/** @type {number} */ (item.avg_price_per_kg))} {PRICE_TEXT.perKg}
      </span>
      {older > 0 && (
        <Badge variant="neutral">
          <Clock aria-hidden="true" />
          <span>{olderLabel(older)}</span>
        </Badge>
      )}
    </p>
  );
}

/** What the farmer gets from a request, shown before the first one. */
function Preview() {
  const icons = [Coins, ArrowUpDown, Lightbulb];
  return (
    <section
      aria-labelledby="forecast-preview"
      className="flex flex-col gap-4 rounded-2xl border-2 border-dashed border-border bg-card/60 p-5 sm:p-6"
    >
      <h2
        id="forecast-preview"
        className="flex items-center gap-2.5 text-lg font-semibold text-text"
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <TrendingUp aria-hidden="true" className="size-5" />
        </span>
        {FORECAST_TEXT.previewTitle}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {FORECAST_TEXT.previewItems.map((text, index) => {
          const Icon = icons[index] ?? Lightbulb;
          return (
            <li
              key={text}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-text"
            >
              <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-gold" />
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-text-secondary">{FORECAST_TEXT.previewHint}</p>
    </section>
  );
}

/**
 * The selection, the request button, and (only after the farmer asks) the forecast. The flow:
 * 1. choose (crop tiles, market, the latest price there), 2. the result in one frame that keeps
 * its place from loading to the answer, with the explanation attached below it, 3. next step.
 * After a request the controls fold into a one line summary with a Change button.
 *
 * The explanation opens only from its own button. Changing the market or crop clears both, so a
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
  const reducedMotion = useReducedMotion();
  // The selection the farmer asked a forecast for, and whether the explanation is open.
  const saved = useForecastRequest();
  const requested = saved?.market === market && saved?.crop === crop;
  const whyOpen = requested && saved.whyOpen;
  // The folded controls opened again with Change (or Compare another market).
  const [editing, setEditing] = useState(false);
  // The farmer changed the selection after a forecast was shown.
  const [changed, setChanged] = useState(false);

  const resultHeadingRef = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const marketRef = useRef(/** @type {HTMLSelectElement | null} */ (null));
  const explanationRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const pendingFocus = useRef(/** @type {null | 'result' | 'market'} */ (null));

  // Farmers see only the 1 month ahead forecast, and nothing is fetched before the click.
  const selectedQuery = useForecast({ market, crop, horizon: HORIZON, enabled: requested });
  const state = requested ? forecastState(selectedQuery) : null;
  const forecast = state?.kind === 'ok' ? state.forecast : null;
  const folded = requested && !editing;

  // The control that was used disappears (request) or appears (Change): move focus on.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === 'result') resultHeadingRef.current?.focus();
    else marketRef.current?.focus();
  });

  /** @param {Record<string, string>} changes */
  function changeSelection(changes) {
    if (requested) setChanged(true);
    clearForecastRequest();
    update(changes);
  }

  function request() {
    setChanged(false);
    setEditing(false);
    pendingFocus.current = 'result';
    requestForecast(market, crop);
  }

  function openControls() {
    setEditing(true);
    pendingFocus.current = 'market';
  }

  function toggleWhy() {
    const open = !whyOpen;
    setWhyOpen(open);
    if (open) {
      // The panel opens right under the card; bring it into view on small screens.
      requestAnimationFrame(() =>
        explanationRef.current?.scrollIntoView?.({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'nearest',
        }),
      );
    }
  }

  const title = `${cropLabel(crop)} in ${market}, ${inLabel(horizonMonths(HORIZON))}`;
  const CropIcon = CROP_ICONS[crop];
  const enter = 'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2';

  return (
    <>
      {folded ? (
        <section
          aria-labelledby="forecast-choose"
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card sm:px-5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary"
            >
              <Check className="size-4" strokeWidth={3} />
            </span>
            <div className="flex min-w-0 flex-col">
              <h2 id="forecast-choose" className="text-sm text-text-secondary">
                {FORECAST_TEXT.yourChoice}
              </h2>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-semibold text-text">
                <span className="flex items-center gap-1.5">
                  <CropIcon aria-hidden="true" className="size-4 text-accent-gold" />
                  {cropLabel(crop)}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  <span className="break-words">{market}</span>
                </span>
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            aria-label={FORECAST_TEXT.changeLabel}
            onClick={openControls}
          >
            <Pencil aria-hidden="true" />
            <span>{FORECAST_TEXT.change}</span>
          </Button>
        </section>
      ) : (
        <section
          aria-labelledby="forecast-choose"
          className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6"
        >
          <StepHeading
            step={1}
            id="forecast-choose"
            title={FORECAST_TEXT.chooseTitle}
            text={FORECAST_TEXT.chooseText}
          />
          <div className="grid gap-5 md:grid-cols-2 md:items-start">
            <CropChoice
              legend="Crop"
              name="crop"
              value={crop}
              onChange={(value) => changeSelection({ crop: value })}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor={marketId} className="mb-0.5 text-sm font-medium text-text">
                Market
              </label>
              <IconSelect
                ref={marketRef}
                id={marketId}
                icon={MapPin}
                value={market}
                onChange={(event) => changeSelection({ market: event.target.value })}
              >
                {markets.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </IconSelect>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <LatestHere market={market} crop={crop} />
            <Button
              type="button"
              size="lg"
              className="min-h-12 w-full sm:ml-auto sm:w-fit"
              disabled={requested && selectedQuery.isFetching}
              onClick={request}
            >
              <ChartLine aria-hidden="true" />
              <span>{FORECAST_TEXT.request}</span>
            </Button>
          </div>
        </section>
      )}

      {!state &&
        (changed ? (
          <p
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-border bg-neutral-bg p-4 text-neutral-text"
          >
            <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span>{FORECAST_TEXT.changedNote}</span>
          </p>
        ) : (
          <Preview />
        ))}

      {state && (state.kind === 'ok' || state.kind === 'loading') && (
        <section
          aria-labelledby="forecast-headline-title"
          aria-busy={state.kind === 'loading' ? true : undefined}
          className={cn(
            'bg-brand relative overflow-hidden rounded-2xl text-on-primary shadow-raised',
            enter,
          )}
        >
          <div aria-hidden="true" className="bg-dot-grid pointer-events-none absolute inset-0" />
          <div className="relative flex flex-col gap-5 p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-card/15 text-xs font-bold ring-1 ring-card/25"
              >
                2
              </span>
              <h2
                ref={resultHeadingRef}
                tabIndex={-1}
                id="forecast-headline-title"
                className="flex items-center gap-2 text-sm font-semibold text-on-primary-muted outline-none focus-visible:underline"
              >
                <MapPin aria-hidden="true" className="size-4 shrink-0" />
                {title}
              </h2>
            </div>
            {forecast ? (
              <Headline forecast={forecast} />
            ) : (
              <div role="status" aria-live="polite" className="flex flex-col gap-4">
                <span className="sr-only">{FORECAST_TEXT.loading}</span>
                <div aria-hidden="true" className="flex flex-wrap items-end gap-4">
                  <div className="h-12 w-28 rounded-lg bg-card/15 motion-safe:animate-pulse" />
                  <div className="h-14 w-48 rounded-lg bg-card/20 motion-safe:animate-pulse" />
                </div>
                <div
                  aria-hidden="true"
                  className="h-7 w-40 rounded-full bg-card/15 motion-safe:animate-pulse"
                />
                <p aria-hidden="true" className="text-sm text-on-primary-muted">
                  {FORECAST_TEXT.working}
                </p>
              </div>
            )}
          </div>
          {forecast && (
            <div className="relative border-t border-card/15 px-3 py-2 sm:px-4">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full justify-between text-on-primary hover:bg-card/10 hover:text-on-primary focus-visible:ring-card sm:w-fit sm:justify-start"
                aria-expanded={whyOpen}
                aria-controls={whyOpen ? explanationId : undefined}
                onClick={toggleWhy}
              >
                <span className="flex items-center gap-2">
                  <Lightbulb aria-hidden="true" />
                  <span>{FORECAST_TEXT.whyTitle}</span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn('transition-transform', whyOpen && 'rotate-180')}
                />
              </Button>
            </div>
          )}
          {forecast && whyOpen && (
            <div
              id={explanationId}
              ref={explanationRef}
              className={cn(
                'relative flex scroll-mt-4 flex-col gap-4 bg-card p-5 text-text sm:p-6',
                'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2',
              )}
            >
              <h3 id="why-title" className="flex items-center gap-2.5 text-lg font-bold">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent-gold-soft text-accent-gold-text">
                  <Lightbulb aria-hidden="true" className="size-5" />
                </span>
                {FORECAST_TEXT.whyTitle}
              </h3>
              <Explanation forecast={forecast} />
            </div>
          )}
        </section>
      )}

      {state && state.kind !== 'ok' && state.kind !== 'loading' && (
        <section
          aria-labelledby="forecast-headline-title"
          className={cn(
            'flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6',
            enter,
          )}
        >
          <h2
            ref={resultHeadingRef}
            tabIndex={-1}
            id="forecast-headline-title"
            className="flex items-center gap-2 text-lg font-semibold text-text outline-none focus-visible:underline"
          >
            <MapPin aria-hidden="true" className="size-5 shrink-0 text-primary" />
            {title}
          </h2>
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
        </section>
      )}

      {forecast && (
        <section
          aria-labelledby="next-step"
          className="flex flex-col gap-4 rounded-2xl border border-border border-l-4 border-l-accent-gold bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <StepHeading
            step={3}
            id="next-step"
            title={FORECAST_TEXT.nextStepTitle}
            text={FORECAST_TEXT.planListingHint}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-fit"
              onClick={openControls}
            >
              <Repeat aria-hidden="true" />
              <span>{FORECAST_TEXT.compare}</span>
            </Button>
            <Button asChild className="w-full sm:w-fit">
              <Link to={`/farmer/listings/new?${new URLSearchParams({ crop, market }).toString()}`}>
                <PackagePlus aria-hidden="true" />
                <span>{FORECAST_TEXT.planListing}</span>
              </Link>
            </Button>
          </div>
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
