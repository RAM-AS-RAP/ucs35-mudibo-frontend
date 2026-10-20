import { AlertCircle, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { hundredthsToString, parseDecimalInput, toHundredths } from '@/lib/decimal';
import { MAX_QUANTITY, MIN_ORDER_QUANTITY } from '@/lib/constants';
import { formatQuantity } from '@/lib/format';
import { LISTING_DETAIL_TEXT } from '@/lib/buyerMessages';

/**
 * @typedef {{ ok: true, value: string } | { ok: false, error: string, code: string }} QuantityResult
 */

/**
 * Check a typed quantity with parseDecimalInput, then against the minimum order quantity and
 * the quantity available now. The value is the normalised decimal string sent to the API.
 * @param {string} text
 * @param {number} available  kg available now (the server's number)
 * @returns {QuantityResult}
 */
export function validateQuantity(text, available) {
  const parsed = parseDecimalInput(text, { max: MAX_QUANTITY });
  if (!parsed.ok) return parsed;
  const value = /** @type {bigint} */ (toHundredths(parsed.value));
  if (value < BigInt(MIN_ORDER_QUANTITY) * 100n) {
    return { ok: false, code: 'below_minimum', error: LISTING_DETAIL_TEXT.minQuantity };
  }
  const limit = toHundredths(available);
  if (limit !== null && value > limit) {
    return {
      ok: false,
      code: 'above_available',
      error: LISTING_DETAIL_TEXT.onlyAvailable(formatQuantity(available)),
    };
  }
  return parsed;
}

/** @param {bigint} hundredths */
const toText = (hundredths) => hundredthsToString(hundredths).replace(/\.?0+$/, '') || '0';

/**
 * A quantity field with minus and plus buttons (step 1 kg, 44 px each). The buttons stay within
 * the minimum order quantity and the available quantity; the arithmetic is on integer hundredths
 * so 2.5 + 1 is exactly 3.5. Typing is free; the screen shows `error` from validateQuantity.
 * @param {{
 *   id: string,
 *   value: string,
 *   onChange: (value: string) => void,
 *   available: number,
 *   disabled?: boolean,
 *   error?: string | null,
 * }} props
 */
export function QuantityStepper({ id, value, onChange, available, disabled = false, error }) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const min = BigInt(MIN_ORDER_QUANTITY) * 100n;
  const max = toHundredths(available) ?? 0n;
  const current = parseDecimalInput(value, { max: MAX_QUANTITY });
  const currentHundredths = current.ok ? /** @type {bigint} */ (toHundredths(current.value)) : null;

  /** @param {1n | -1n} direction */
  function step(direction) {
    let next = currentHundredths === null ? min : currentHundredths + direction * 100n;
    if (next > max) next = max;
    if (next < min) next = min;
    onChange(toText(next));
  }

  const canDecrease = !disabled && currentHundredths !== null && currentHundredths > min;
  const canIncrease =
    !disabled && max >= min && (currentHundredths === null || currentHundredths < max);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{LISTING_DETAIL_TEXT.quantityLabel}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={LISTING_DETAIL_TEXT.decrease}
          aria-controls={id}
          disabled={!canDecrease}
          onClick={() => step(-1n)}
        >
          <Minus aria-hidden="true" />
        </Button>
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className="w-32 text-center tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={LISTING_DETAIL_TEXT.increase}
          aria-controls={id}
          disabled={!canIncrease}
          onClick={() => step(1n)}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      <p id={hintId} className="text-sm text-text-secondary">
        {LISTING_DETAIL_TEXT.quantityHint(formatQuantity(available))}
      </p>
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-negative-text">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
