import { Check } from 'lucide-react';
import { useId } from 'react';
import { PRICE_TEXT } from '@/lib/messages';
import { cn } from '@/lib/utils';

/**
 * Toggle buttons for the markets shown in a chart (`aria-pressed`). At least one stays selected:
 * pressing the only selected market does nothing. A pressed chip shows a check mark as well as
 * its colour.
 * @param {{
 *   markets: string[],
 *   selected: string[],
 *   onChange: (selected: string[]) => void,
 *   legend?: string,
 *   className?: string,
 * }} props
 */
export function MarketChips({
  markets,
  selected,
  onChange,
  legend = PRICE_TEXT.marketsLegend,
  className,
}) {
  const labelId = useId();
  const hintId = useId();

  /** @param {string} market */
  function toggle(market) {
    const isOn = selected.includes(market);
    if (isOn && selected.length === 1) return;
    // Keep the order of `markets` so series colours stay stable.
    const next = isOn
      ? selected.filter((m) => m !== market)
      : markets.filter((m) => m === market || selected.includes(m));
    onChange(next);
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <p id={labelId} className="text-sm font-medium text-text-secondary">
        {legend}
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className="flex flex-wrap gap-2"
      >
        {markets.map((market) => {
          const pressed = selected.includes(market);
          return (
            <button
              key={market}
              type="button"
              aria-pressed={pressed}
              onClick={() => toggle(market)}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-base font-medium transition-colors',
                pressed
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border bg-card text-text hover:bg-canvas',
              )}
            >
              {pressed && <Check aria-hidden="true" className="size-4" />}
              <span>{market}</span>
            </button>
          );
        })}
      </div>
      <p id={hintId} className="text-sm text-text-secondary">
        {PRICE_TEXT.marketsHint}
      </p>
    </div>
  );
}
