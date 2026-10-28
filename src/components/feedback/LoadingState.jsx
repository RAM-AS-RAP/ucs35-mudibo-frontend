import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Skeleton placeholder while content loads; announced once to screen readers.
 * @param {{ label?: string, rows?: number, className?: string }} props
 */
export function LoadingState({ label = 'Loading…', rows = 3, className }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col gap-3', className)}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-1/2" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

/**
 * The whole page's placeholder while a screen's code loads inside the app shell (right after
 * signing in, or on the first visit to a screen): a title, a row of summary cards and a larger
 * block, so the page appears to fill in rather than stay blank. Announced once.
 * @param {{ label?: string }} props
 */
export function PageLoadingState({ label = 'Loading page…' }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-2/3 max-w-xs" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
