import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUserMessageDetails } from '@/api/errors';
import { cn } from '@/lib/utils';

/**
 * A failed load: plain message, "Try again", and the request id as a "Reference".
 * @param {{
 *   error?: unknown,
 *   title?: string,
 *   message?: string,
 *   onRetry?: () => void,
 *   className?: string,
 * }} props
 */
export function ErrorState({ error, title = 'Something went wrong', message, onRetry, className }) {
  const details = getUserMessageDetails(error);
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-5 py-8 text-center',
        className,
      )}
    >
      <AlertTriangle aria-hidden="true" className="size-8 text-negative" />
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      <p className="max-w-prose text-text-secondary">{message ?? details.message}</p>
      {details.reference && (
        <p className="text-sm text-text-secondary">
          Reference: <span className="font-mono break-all">{details.reference}</span>
        </p>
      )}
      {onRetry && (
        <Button type="button" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
