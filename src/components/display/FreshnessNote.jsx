import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A neutral note on where the figures come from, without any date ("Prices are monthly figures
 * from FEWS NET."). Pass FRESHNESS_PRICES or FRESHNESS_FORECAST from lib/messages.
 * @param {{ text: string, className?: string }} props
 */
export function FreshnessNote({ text, className }) {
  return (
    <p
      className={cn(
        'inline-flex w-fit items-center gap-2 rounded-md bg-neutral-bg px-3 py-1.5 text-sm text-neutral-text',
        className,
      )}
    >
      <Info aria-hidden="true" className="size-4 shrink-0" />
      <span>{text}</span>
    </p>
  );
}
