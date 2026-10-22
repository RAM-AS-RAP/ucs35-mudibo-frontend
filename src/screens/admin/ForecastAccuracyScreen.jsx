import { useId, useMemo } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  History,
  Info,
  Radio,
  XCircle,
} from 'lucide-react';
import { useMarkets } from '@/api/queries';
import { useForecastAccuracy } from '@/api/queries/admin';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/display/PageHeader';
import { Segmented } from '@/components/display/Segmented';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, SELECT_CLASS, useFilterParams } from '@/components/admin/FilterBar';
import { LoadMore, pagesOf, RefreshButton, ShowingCount } from '@/components/admin/ListParts';
import { ResponsiveTable } from '@/components/admin/ResponsiveTable';
import {
  formatCount,
  formatPctValue,
  formatRate,
  horizonLabel,
  NOT_ENOUGH_DATA,
} from '@/lib/accuracyFormat';
import { ACCURACY_FILTER_OPTIONS, ACCURACY_TEXT as T } from '@/lib/adminMessages';
import { formatKES, formatMonth } from '@/lib/format';
import { cropLabel } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';

/** @typedef {import('@/api/endpoints/admin').AccuracyItem} AccuracyItem */
/** @typedef {import('@/api/endpoints/admin').AccuracySummary} AccuracySummary */

/**
 * A yes or no value with an icon and a word; pending or missing values say so.
 * @param {{ value: boolean | null | undefined, pending: boolean }} props
 */
function YesNo({ value, pending }) {
  if (pending) return <span>{T.pendingValue}</span>;
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1.5" data-yes-no="yes">
        <CheckCircle2 aria-hidden="true" className="size-4 text-positive" />
        {T.yes}
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center gap-1.5" data-yes-no="no">
        <XCircle aria-hidden="true" className="size-4 text-negative" />
        {T.no}
      </span>
    );
  }
  return <span>{T.notAvailable}</span>;
}

/** @param {{ backfill: boolean }} props */
function SourceTag({ backfill }) {
  return backfill ? (
    <Badge variant="neutral" data-source="backfill">
      <History aria-hidden="true" />
      <span>{T.backfill}</span>
    </Badge>
  ) : (
    <Badge variant="outline" data-source="live">
      <Radio aria-hidden="true" />
      <span>{T.live}</span>
    </Badge>
  );
}

/** @param {unknown} value */
const money = (value) =>
  value === null || value === undefined ? NOT_ENOUGH_DATA : `${formatKES(value)}`;

/** @type {ReadonlyArray<import('@/components/admin/ResponsiveTable').Column<AccuracyItem>>} */
const COLUMNS = [
  {
    key: 'series',
    header: `${T.market}, ${T.crop.toLowerCase()} and ${T.horizon.toLowerCase()}`,
    cell: (i) => `${i.market}, ${cropLabel(i.crop)}, ${horizonLabel(i.horizon)}`,
  },
  { key: 'origin', header: T.originMonth, cell: (i) => formatMonth(i.origin_month) },
  { key: 'target', header: T.targetMonth, cell: (i) => formatMonth(i.target_month) },
  {
    key: 'originPrice',
    header: T.originPrice,
    numeric: true,
    cell: (i) => (i.origin_price === null ? T.notAvailable : formatKES(i.origin_price)),
  },
  {
    key: 'predicted',
    header: T.predicted,
    numeric: true,
    cell: (i) => (i.predicted_price === null ? T.notAvailable : formatKES(i.predicted_price)),
  },
  {
    key: 'actual',
    header: T.actual,
    numeric: true,
    cell: (i) =>
      i.is_pending || i.actual_price === null ? T.pendingValue : formatKES(i.actual_price),
  },
  {
    key: 'error',
    header: T.pctError,
    numeric: true,
    cell: (i) => (i.is_pending ? T.pendingValue : formatPctValue(i.pct_error)),
  },
  {
    key: 'direction',
    header: T.direction,
    cell: (i) => <YesNo value={i.direction_correct} pending={i.is_pending} />,
  },
  {
    key: 'beat',
    header: T.beat,
    cell: (i) => <YesNo value={i.beat_persistence} pending={i.is_pending} />,
  },
  { key: 'source', header: T.source, cell: (i) => <SourceTag backfill={i.is_backfill === true} /> },
];

/** @param {{ summary: AccuracySummary }} props */
function SummaryCard({ summary }) {
  const heading = T.summaryHeading(horizonLabel(summary.horizon), summary.is_backfill === true);
  return (
    <section
      aria-label={heading}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid="accuracy-summary"
    >
      <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-text">
        <span>{heading}</span>
        <SourceTag backfill={summary.is_backfill === true} />
      </h3>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {[
          [T.realised, formatCount(summary.n_realised)],
          [T.pending, formatCount(summary.n_pending)],
          [T.mape, formatPctValue(summary.mape)],
          [T.meanAbsError, money(summary.mean_abs_error)],
          [T.directional, formatRate(summary.directional_accuracy)],
          [T.beatPersistence, formatRate(summary.beat_persistence_rate)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-text-secondary">{label}</dt>
            <dd className="font-semibold text-text tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Forecast accuracy (/admin/forecast-accuracy): forecasts compared with the prices published
 * later. Filters for market (GET /markets), crop, horizon, source (live or backfill) and
 * "Include pending". One summary card per horizon and source in the response, an explanation of
 * each measure, the API's note, and a table of forecasts. Every figure is the server's; missing
 * ones read "Not enough data". No chart in this module.
 */
export default function ForecastAccuracyScreen() {
  const headingRef = usePageTitle(T.title);
  const ids = useId();
  const markets = useMarkets();
  const marketNames = useMemo(() => {
    if (markets.data) return markets.data.map((m) => m.name);
    return markets.isError ? [] : null;
  }, [markets.data, markets.isError]);
  const rules = useMemo(
    () => ({
      market: {
        accept: (/** @type {string} */ v) =>
          v.length <= 100 && (marketNames === null || marketNames.includes(v)),
      },
      crop: { values: ['all', 'maize', 'beans'], fallback: 'all' },
      horizon: { values: ['all', 'one_month', 'two_month'], fallback: 'all' },
      source: { values: ['all', 'live', 'backfill'], fallback: 'all' },
      // "Include pending" is on by default (the server's default); "no" turns it off.
      pending: { values: ['yes', 'no'], fallback: 'yes' },
    }),
    [marketNames],
  );
  const filters = useFilterParams(rules);
  const { market, crop, horizon, source, pending } = filters.values;
  const includePending = pending !== 'no';
  const query = useForecastAccuracy({
    market,
    crop: crop === 'all' ? null : /** @type {any} */ (crop),
    horizon: horizon === 'all' ? null : /** @type {any} */ (horizon),
    isBackfill: source === 'all' ? null : source === 'backfill',
    includePending,
  });

  const { items, total } = pagesOf(query.data);
  const first = query.data?.pages[0];
  const summary = first?.summary ?? [];
  const note = first?.note ?? '';

  let body;
  if (query.isPending) {
    body = <LoadingState label={T.loading} rows={3} />;
  } else if (query.isError && !query.isFetchNextPageError) {
    body = <ErrorState error={query.error} title={T.errorTitle} onRetry={() => query.refetch()} />;
  } else {
    body = (
      <div className="flex flex-col gap-6">
        {summary.length > 0 && (
          <section aria-labelledby={`${ids}-summary`} className="flex flex-col gap-3">
            <h2 id={`${ids}-summary`} className="text-xl font-semibold text-text">
              {T.summaryTitle}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {summary.map((s) => (
                <SummaryCard key={`${s.horizon}:${String(s.is_backfill)}`} summary={s} />
              ))}
            </div>
          </section>
        )}
        <details
          className="rounded-xl border border-border bg-card p-4"
          data-testid="what-these-mean"
        >
          <summary className="min-h-11 cursor-pointer font-medium text-text">
            {T.whatTheseMean}
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-text">
            {T.explanations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
        {note && (
          <p
            className="flex items-start gap-2 text-sm text-text-secondary"
            data-testid="accuracy-note"
          >
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">{`${T.noteLabel}: `}</span>
              {note}
            </span>
          </p>
        )}
        {items.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title={filters.active ? T.emptyFilteredTitle : T.emptyTitle}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <ShowingCount shown={items.length} total={total} />
            <ResponsiveTable
              caption={T.caption}
              columns={COLUMNS}
              rows={items}
              rowKey={(i) =>
                `${i.market}:${i.crop}:${i.horizon}:${i.origin_month}:${String(i.is_backfill)}`
              }
            />
            <LoadMore query={query} errorTitle={T.errorTitle} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={T.title}
        description={T.description}
        headingRef={headingRef}
        actions={
          <RefreshButton
            onRefresh={() => query.refetch()}
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            disabled={query.isPending}
          />
        }
      />
      <FilterBar label={T.filterLabel} active={filters.active} onClear={filters.clear}>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor={`${ids}-market`}>{T.marketLabel}</Label>
          <select
            id={`${ids}-market`}
            className={SELECT_CLASS}
            value={market ?? ''}
            onChange={(event) => filters.set({ market: event.target.value || null })}
          >
            <option value="">{T.allMarkets}</option>
            {(marketNames ?? (market ? [market] : [])).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {markets.isError && (
            <p className="flex items-start gap-1.5 text-sm text-text-secondary">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{T.marketsError}</span>
            </p>
          )}
        </div>
        <Segmented
          legend={T.cropLegend}
          name="accuracy-crop"
          options={ACCURACY_FILTER_OPTIONS.crop}
          value={/** @type {any} */ (crop)}
          onChange={(value) => filters.set({ crop: value })}
        />
        <Segmented
          legend={T.horizonLegend}
          name="accuracy-horizon"
          options={ACCURACY_FILTER_OPTIONS.horizon}
          value={/** @type {any} */ (horizon)}
          onChange={(value) => filters.set({ horizon: value })}
        />
        <Segmented
          legend={T.sourceLegend}
          name="accuracy-source"
          options={ACCURACY_FILTER_OPTIONS.source}
          value={/** @type {any} */ (source)}
          onChange={(value) => filters.set({ source: value })}
        />
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-base text-text">
          <input
            type="checkbox"
            role="switch"
            checked={includePending}
            aria-checked={includePending}
            onChange={(event) => filters.set({ pending: event.target.checked ? 'yes' : 'no' })}
            className="size-5 accent-primary"
          />
          <span className="flex items-center gap-1.5">
            <Clock aria-hidden="true" className="size-4" />
            {T.includePending}
          </span>
        </label>
      </FilterBar>
      {body}
    </div>
  );
}
