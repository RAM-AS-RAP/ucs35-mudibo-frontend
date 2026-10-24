import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, Minus } from 'lucide-react';
import { formatPct } from '@/lib/format';
import { DIRECTION_WORDS } from '@/lib/forecast';
import { cn } from '@/lib/utils';

const POSITIVE = 'bg-card text-positive-text border-positive';
const NEGATIVE = 'bg-card text-negative-text border-negative';
const NEUTRAL = 'bg-neutral-bg text-neutral-text border-transparent';

const STYLES = {
  positive: {
    Icon: ArrowUpRight,
    word: 'Increasing',
    className: POSITIVE,
    iconClass: 'text-positive',
  },
  negative: {
    Icon: ArrowDownRight,
    word: 'Falling',
    className: NEGATIVE,
    iconClass: 'text-negative',
  },
  zero: { Icon: Minus, word: 'No change', className: NEUTRAL, iconClass: 'text-neutral-text' },
};

/** Price and forecast directions with the 1% "little change" band (directionOf in lib/forecast). */
const DIRECTION_STYLES = {
  rise: {
    Icon: ArrowUp,
    word: DIRECTION_WORDS.rise,
    className: POSITIVE,
    iconClass: 'text-positive',
  },
  fall: {
    Icon: ArrowDown,
    word: DIRECTION_WORDS.fall,
    className: NEGATIVE,
    iconClass: 'text-negative',
  },
  flat: {
    Icon: Minus,
    word: DIRECTION_WORDS.flat,
    className: NEUTRAL,
    iconClass: 'text-neutral-text',
  },
};

/**
 * A percentage change shown with an icon, a sign and a word, never by colour alone.
 * @param {{
 *   value: number | string | null | undefined,
 *   label?: string,
 *   suffix?: string,
 *   direction?: 'rise' | 'fall' | 'flat',
 *   className?: string,
 * }} props
 *   `label` replaces the default word.
 *   `suffix` follows the number ("+4.5% vs 1 month ago").
 *   `direction` (from directionOf) picks the style, icon and word instead of the sign of the value.
 */
export function DeltaTag({ value, label, suffix, direction, className }) {
  const n = typeof value === 'string' ? Number(value) : value;
  const text = formatPct(value);
  // Use the rounded display value so "+0.0%" never shows as positive.
  const sign =
    n === null || n === undefined || !Number.isFinite(n) || text === '0.0%'
      ? 'zero'
      : n > 0
        ? 'positive'
        : 'negative';
  const style = direction ? DIRECTION_STYLES[direction] : STYLES[sign];
  const { Icon } = style;
  return (
    <span
      data-direction={direction ?? sign}
      className={cn(
        'inline-flex w-fit flex-wrap items-center gap-x-1 rounded-md border px-2 py-0.5 text-sm font-medium',
        style.className,
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn('size-4 shrink-0', style.iconClass)} />
      <span className="whitespace-nowrap tabular-nums">{suffix ? `${text} ${suffix}` : text}</span>
      <span className="whitespace-nowrap">{label ?? style.word}</span>
    </span>
  );
}
