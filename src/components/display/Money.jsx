import { formatKES } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * An amount in KES exactly as the server returned it. Never compute totals on the client.
 * @param {{ value: number | string | null | undefined, className?: string }} props
 */
export function Money({ value, className }) {
  return <span className={cn('tabular-nums', className)}>{formatKES(value)}</span>;
}
