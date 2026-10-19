import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useCurrentPrices, useMarkets, usePriceTrends } from '@/api/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/display/DataTable';
import { FreshnessNote } from '@/components/display/FreshnessNote';
import { MarketChips } from '@/components/display/MarketChips';
import { PageHeader } from '@/components/display/PageHeader';
import { PriceCard } from '@/components/display/PriceCard';
import { Segmented } from '@/components/display/Segmented';
import { TrendChart } from '@/components/display/TrendChart';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { formatKES } from '@/lib/format';
import { cropLabel, FRESHNESS_PRICES, PRICE_TEXT } from '@/lib/messages';
import { agoLabel } from '@/lib/relativeTime';
import { buildTrendRows, monthsOlderByMarket, plottedMonthCount } from '@/lib/trends';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  cleanParams,
  CROP_OPTIONS,
  CROPS,
  DEFAULT_CROP,
  pickMarkets,
  pickRange,
  pickValue,
  RANGE_OPTIONS,
} from './params';

/** Fewer plotted months than this show the table and a note instead of a chart. */
const MIN_CHART_POINTS = 3;

/**
 * The trend data as table rows: "Period" first (relative months), newest row last.
 * @param {import('@/lib/trends').TrendRow[]} rows
 * @param {string[]} markets
 */
function trendTableRows(rows, markets) {
  return rows.map((row) => ({
    id: String(row.n),
    period: agoLabel(row.n),
    ...Object.fromEntries(
      markets.map((market) => {
        const price = row.values[market];
        return [
          market,
          price === null || price === undefined ? PRICE_TEXT.noPrice : formatKES(price),
        ];
      }),
    ),
  }));
}

/**
 * @param {{ crop: 'maize' | 'beans' }} props
 */
function LatestPrices({ crop }) {
  const current = useCurrentPrices(crop);
  if (current.isPending) return <LoadingState label={PRICE_TEXT.loadingPrices} rows={2} />;
  if (current.isError) {
    return (
      <ErrorState
        error={current.error}
        title={PRICE_TEXT.errorTitle}
        onRetry={() => current.refetch()}
      />
    );
  }
  const items = current.data.items ?? [];
  if (items.length === 0) {
    return <EmptyState title={PRICE_TEXT.emptyTitle} description={PRICE_TEXT.empty} />;
  }
  const older = monthsOlderByMarket(items);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <PriceCard
          key={String(item.market)}
          market={String(item.market)}
          pricePerKg={/** @type {number} */ (item.avg_price_per_kg)}
          changePct={/** @type {number | null} */ (item.change_pct)}
          monthsOlder={older[String(item.market)] ?? 0}
        />
      ))}
    </div>
  );
}

/**
 * @param {{ crop: 'maize' | 'beans', markets: string[], months: number }} props
 */
function TrendBody({ crop, markets, months }) {
  const results = usePriceTrends({ markets, crop, months });
  if (results.some((r) => r.isPending)) {
    return <LoadingState label={PRICE_TEXT.loadingTrend} rows={1} />;
  }
  const failed = results.find((r) => r.isError);
  if (failed) {
    return (
      <ErrorState
        error={failed.error}
        title={PRICE_TEXT.trendErrorTitle}
        onRetry={() => results.filter((r) => r.isError).forEach((r) => r.refetch())}
      />
    );
  }
  const trends = results.map((r) => /** @type {import('@/lib/trends').Trend} */ (r.data));
  const { rows, markets: shown } = buildTrendRows(trends);
  if (rows.length === 0 || plottedMonthCount(rows) === 0) {
    return <EmptyState title={PRICE_TEXT.emptyTitle} description={PRICE_TEXT.empty} />;
  }
  const columns = [
    { key: 'period', header: PRICE_TEXT.periodColumn },
    ...shown.map((market) => ({ key: market, header: `${market} (KES per kg)`, numeric: true })),
  ];
  const table = (
    <DataTable
      caption={`${cropLabel(crop)} prices by month, newest last`}
      columns={columns}
      rows={trendTableRows(rows, shown)}
    />
  );
  if (plottedMonthCount(rows) < MIN_CHART_POINTS) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-text-secondary">{PRICE_TEXT.fewPoints}</p>
        {table}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <TrendChart rows={rows} markets={shown} crop={crop} />
      <details className="rounded-md border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium text-text">
          {PRICE_TEXT.seeNumbers}
        </summary>
        <div className="px-3 pb-3">{table}</div>
      </details>
    </div>
  );
}

/**
 * The trend card body: market chips, range control and the chart, once the markets are known.
 * @param {{
 *   marketsQuery: ReturnType<typeof useMarkets>,
 *   available: string[],
 *   selected: string[],
 *   crop: 'maize' | 'beans',
 *   range: number,
 *   update: (changes: Record<string, string>) => void,
 * }} props
 */
function TrendCardContent({ marketsQuery, available, selected, crop, range, update }) {
  if (marketsQuery.isPending) return <LoadingState label={PRICE_TEXT.loadingTrend} rows={1} />;
  if (marketsQuery.isError) {
    return (
      <ErrorState
        error={marketsQuery.error}
        title={PRICE_TEXT.trendErrorTitle}
        onRetry={() => marketsQuery.refetch()}
      />
    );
  }
  if (available.length === 0) {
    return <EmptyState title={PRICE_TEXT.emptyTitle} description={PRICE_TEXT.empty} />;
  }
  return (
    <>
      <MarketChips
        markets={available}
        selected={selected}
        onChange={(next) => update({ markets: next.join(',') })}
      />
      <Segmented
        legend={PRICE_TEXT.rangeLegend}
        name="range"
        options={RANGE_OPTIONS}
        value={String(range)}
        onChange={(value) => update({ range: value })}
      />
      <TrendBody crop={crop} markets={selected} months={range} />
    </>
  );
}

/** Current prices of every market and the price trend, for maize or beans. */
export default function PricesScreen() {
  const headingRef = usePageTitle('Prices');
  const [params, setParams] = useSearchParams();
  const marketsQuery = useMarkets();
  const available = useMemo(
    () => (marketsQuery.data ?? []).map((m) => m.name),
    [marketsQuery.data],
  );

  const crop = pickValue(params.get('crop'), CROPS, DEFAULT_CROP);
  const range = pickRange(params.get('range'));
  const selected = pickMarkets(params.get('markets'), available);

  // Replace invalid values in the URL with the defaults (markets once the list is known).
  const marketsKnown = marketsQuery.isSuccess;
  useEffect(() => {
    const next = cleanParams(params, {
      crop: true,
      range: true,
      markets: marketsKnown ? available : null,
    });
    if (next) setParams(next, { replace: true });
  }, [params, setParams, marketsKnown, available]);

  /** @param {Record<string, string>} changes */
  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    setParams(next, { replace: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Prices"
        description="Monthly wholesale prices per kg."
        headingRef={headingRef}
      />
      <FreshnessNote text={FRESHNESS_PRICES} />
      <Segmented
        legend="Crop"
        name="crop"
        options={CROP_OPTIONS}
        value={crop}
        onChange={(value) => update({ crop: value })}
      />

      <section aria-labelledby="latest-prices" className="flex flex-col gap-3">
        <h2 id="latest-prices" className="text-xl font-semibold text-text">
          {`Latest ${cropLabel(crop).toLowerCase()} prices`}
        </h2>
        <LatestPrices crop={crop} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle id="price-trend">{PRICE_TEXT.trendTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TrendCardContent
            marketsQuery={marketsQuery}
            available={available}
            selected={selected}
            crop={crop}
            range={range}
            update={update}
          />
        </CardContent>
      </Card>
    </div>
  );
}
