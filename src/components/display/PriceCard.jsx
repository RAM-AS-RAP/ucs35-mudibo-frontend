import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatKES } from '@/lib/format';
import { bagPriceText, directionOf } from '@/lib/forecast';
import { LABEL_LATEST_PRICE, PRICE_TEXT } from '@/lib/messages';
import { agoLabel, olderLabel } from '@/lib/relativeTime';
import { cn } from '@/lib/utils';
import { DeltaTag } from './DeltaTag';

/**
 * The change against the month before, or "No change data" when the backend has none.
 * `change_pct` always compares the latest price with the month before it, hence agoLabel(1).
 * @param {{ changePct: number | null | undefined }} props
 */
export function PriceChange({ changePct }) {
  if (typeof changePct !== 'number' || !Number.isFinite(changePct)) {
    return (
      <Badge variant="neutral" data-direction="none">
        {PRICE_TEXT.noChange}
      </Badge>
    );
  }
  return (
    <DeltaTag
      value={changePct}
      direction={directionOf(changePct)}
      suffix={PRICE_TEXT.vs(agoLabel(1))}
    />
  );
}

/**
 * A market's latest monthly price: "KES 82.00 per kg", the 90 kg bag line, the change against
 * the month before with a direction word, and "N months older" when this market's latest price
 * is older than the newest one on the screen. No month or date is shown.
 * @param {{
 *   market: string,
 *   pricePerKg: number,
 *   changePct: number | null,
 *   monthsOlder?: number,
 *   headingLevel?: 'h2' | 'h3',
 *   className?: string,
 * }} props
 */
export function PriceCard({
  market,
  pricePerKg,
  changePct,
  monthsOlder = 0,
  headingLevel: Heading = 'h3',
  className,
}) {
  const bag = bagPriceText(pricePerKg);
  return (
    <article
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading className="text-lg font-semibold text-text">{market}</Heading>
        {monthsOlder > 0 && (
          <Badge variant="neutral">
            <Clock aria-hidden="true" />
            <span>{olderLabel(monthsOlder)}</span>
          </Badge>
        )}
      </div>
      <p className="text-sm font-medium text-text-secondary">{LABEL_LATEST_PRICE}</p>
      <p className="flex flex-wrap items-baseline gap-x-2 text-text">
        <span className="text-3xl font-bold tabular-nums">{formatKES(pricePerKg)}</span>
        <span className="text-text-secondary">{PRICE_TEXT.perKg}</span>
      </p>
      {bag && <p className="text-sm text-text-secondary">{bag}</p>}
      <PriceChange changePct={changePct} />
    </article>
  );
}
