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
