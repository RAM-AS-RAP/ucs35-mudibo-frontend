import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { PRICE_TEXT } from '@/lib/messages';
import { toChartData, trendSummary } from '@/lib/trends';
import { cn } from '@/lib/utils';

// Recharts is loaded only here, lazily, so it stays out of the initial JavaScript.
const TrendChartCanvas = lazy(() => import('./TrendChartCanvas'));

/**
 * The price trend chart. The wrapper is an image with a generated text summary (relative months
 * only); the numbers are also in a data table next to it (see PricesScreen).
 * @param {{
 *   rows: import('@/lib/trends').TrendRow[],
 *   markets: string[],
 *   crop: string,
 *   className?: string,
 * }} props
 */
export function TrendChart({ rows, markets, crop, className }) {
  const summary = trendSummary(rows, markets, crop);
  return (
    <div
      role="img"
      aria-label={summary}
      data-testid="trend-chart"
      className={cn('h-64 w-full min-w-0', className)}
    >
      <Suspense
        fallback={
          <Skeleton className="h-full w-full">
            <span className="sr-only">{PRICE_TEXT.loadingChart}</span>
          </Skeleton>
        }
      >
        <TrendChartCanvas data={toChartData(rows)} markets={markets} />
      </Suspense>
    </div>
  );
}
