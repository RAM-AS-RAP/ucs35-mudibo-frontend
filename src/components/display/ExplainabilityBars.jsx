import { useId } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatKES, formatPct, formatSignedKES } from '@/lib/format';
import { FORECAST_TEXT } from '@/lib/messages';
import { cn } from '@/lib/utils';

/**
 * Bar styles by effect. The word (Boost, Drag, No effect) and the sign are always shown next to
 * the colour.
 */
const EFFECT = {
  increases: {
    Icon: ArrowUp,
    bar: 'border-positive bg-positive-soft',
    text: 'text-positive-text',
  },
  decreases: {
    Icon: ArrowDown,
    bar: 'border-negative bg-negative-soft',
    text: 'text-negative-text',
  },
  neutral: {
    Icon: Minus,
    bar: 'border-neutral-text bg-neutral-bg',
    text: 'text-neutral-text',
  },
};

/**
 * A diverging bar: negative values grow left from the centre line, positive ones right.
 * Decorative only (`aria-hidden`); the numbers are in the row's text.
 * @param {{ fraction: number, side: 'left' | 'right', className: string }} props
 */
function Bar({ fraction, side, className }) {
  // A tiny visible stub for values that round to almost nothing.
  const width = `${Math.max(2, Math.round(fraction * 100))}%`;
  const bar = (
    <div data-bar="" className={cn('h-4 rounded-sm border', className)} style={{ width }} />
  );
  return (
    <div aria-hidden="true" className="grid grid-cols-2">
      <div className="flex justify-end border-r-2 border-text-secondary pr-px">
        {side === 'left' && bar}
      </div>
      <div className="flex justify-start pl-px">{side === 'right' && bar}</div>
    </div>
  );
}

/**
 * The explanation of a forecast as an accessible list (a `ul` of rows), fully readable by screen
 * readers and responsive down to 360 px. Bars are `div`s whose width comes from `barFraction`.
 * Not drawn with Recharts on purpose (docs/forecast-display.md). Only call this with an
 * explanation that passed parseShap().
 * @param {{
 *   rows: import('@/lib/forecast').ExplainabilityRow[],
 *   typical: { label: string, description: string, pct: number, barFraction: number },
 *   expectedChangePct: number,
 *   predictedPrice: number,
 *   summary: string,
 *   className?: string,
 * }} props
 */
export function ExplainabilityBars({
  rows,
  typical,
  expectedChangePct,
  predictedPrice,
  summary,
  className,
}) {
  const captionId = useId();
  return (
    <figure aria-labelledby={captionId} className={cn('m-0 flex flex-col gap-3', className)}>
      <figcaption id={captionId} className="sr-only">
        {summary}
      </figcaption>
      <ul className="flex flex-col gap-4">
        <li data-row="typical" className="flex flex-col gap-1.5">
          <Badge variant="neutral" className="h-auto whitespace-normal">
            <Minus aria-hidden="true" />
            <span>
              {typical.label}: {formatPct(typical.pct)}
            </span>
          </Badge>
          <p className="text-sm text-text-secondary">{typical.description}</p>
          <Bar
            fraction={typical.barFraction}
            side={typical.pct < 0 ? 'left' : 'right'}
            className={EFFECT.neutral.bar}
          />
        </li>
        {rows.map((row) => {
          const effect = EFFECT[row.direction];
          const { Icon } = effect;
          return (
            <li
              key={row.label}
              data-row="group"
              data-effect={row.word}
              className="flex flex-col gap-1.5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-medium text-text">{row.label}</span>
                <span
                  className={cn(
                    'inline-flex flex-wrap items-center gap-x-1.5 font-medium',
                    effect.text,
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span>{row.word}</span>
                  <span className="tabular-nums">{formatPct(row.pct)}</span>
                  <span className="text-sm text-text-secondary">
                    (about {formatSignedKES(row.kesImpact)} per kg)
                  </span>
                </span>
              </div>
              <p className="text-sm text-text-secondary">{row.description}</p>
              <Bar
                fraction={row.barFraction}
                side={row.pct < 0 ? 'left' : 'right'}
                className={effect.bar}
              />
            </li>
          );
        })}
        <li
          data-row="total"
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border pt-3"
        >
          <span className="font-semibold text-text">{FORECAST_TEXT.totalLabel}</span>
          <span className="font-semibold text-text tabular-nums">
            {formatPct(expectedChangePct)}, to {formatKES(predictedPrice)} per kg
          </span>
        </li>
      </ul>
    </figure>
  );
}
