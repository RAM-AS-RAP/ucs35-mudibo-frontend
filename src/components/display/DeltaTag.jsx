import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';

const STYLES = {
  positive: {
    Icon: ArrowUpRight,
    word: 'Increasing',
    className: 'bg-card text-positive-text border-positive',
    iconClass: 'text-positive',
  },
  negative: {
    Icon: ArrowDownRight,
    word: 'Falling',
    className: 'bg-card text-negative-text border-negative',
    iconClass: 'text-negative',
  },
  zero: {
    Icon: Minus,
    word: 'No change',
    className: 'bg-neutral-bg text-neutral-text border-transparent',
    iconClass: 'text-neutral-text',
  },
};

/**
 * A percentage change shown with an icon, a sign and a word, never by colour alone.
 * @param {{ value: number | string | null | undefined, label?: string, className?: string }} props
 *   `label` replaces the default word (for example "Boost" or "Drag" on explanation bars).
 */
export function DeltaTag({ value, label, className }) {
  const n = typeof value === 'string' ? Number(value) : value;
  const text = formatPct(value);
  // Use the rounded display value so "+0.0%" never shows as positive.
  const direction =
    n === null || n === undefined || !Number.isFinite(n) || text === '0.0%'
      ? 'zero'
      : n > 0
        ? 'positive'
        : 'negative';
  const style = STYLES[direction];
  const { Icon } = style;
  return (
    <span
      data-direction={direction}
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 text-sm font-medium whitespace-nowrap',
        style.className,
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn('size-4', style.iconClass)} />
      <span>{text}</span>
      <span>{label ?? style.word}</span>
    </span>
  );
}
