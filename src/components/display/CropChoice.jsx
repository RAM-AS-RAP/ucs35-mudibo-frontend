import { Bean, Check, Wheat } from 'lucide-react';
import { cropLabel } from '@/lib/messages';
import { cn } from '@/lib/utils';

/** @typedef {'maize' | 'beans'} Crop */

const CROPS = /** @type {const} */ (['maize', 'beans']);

/** The picture for each crop (decorative). */
export const CROP_ICONS = Object.freeze({ maize: Wheat, beans: Bean });

/**
 * The crop choice as picture tiles (New listing, Forecast), built on native radio inputs, so Tab
 * reaches the group and the arrow keys move the choice. The check mark and the border show the
 * choice, never colour alone. Each tile is at least 64 px high.
 * @param {{
 *   legend: string,
 *   name: string,
 *   value: Crop,
 *   onChange: (value: Crop) => void,
 *   disabled?: boolean,
 *   className?: string,
 * }} props
 */
export function CropChoice({ legend, name, value, onChange, disabled, className }) {
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-2', className)}>
      <legend className="mb-2 text-sm font-medium text-text">{legend}</legend>
      <div className="grid grid-cols-2 gap-3">
        {CROPS.map((crop) => {
          const Icon = CROP_ICONS[crop];
          const checked = crop === value;
          return (
            <label key={crop} className="flex">
              <input
                type="radio"
                name={name}
                value={crop}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(crop)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'relative flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl border-2 border-border bg-card p-3 text-base font-semibold text-text transition-colors hover:border-primary/50',
                  'peer-checked:border-primary peer-checked:bg-primary-soft',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring',
                  'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-lg',
                    checked ? 'bg-primary text-on-primary' : 'bg-accent-gold-soft text-accent-gold',
                  )}
                >
                  <Icon className="size-5" />
                </span>
                {cropLabel(crop)}
                {checked && (
                  <Check
                    aria-hidden="true"
                    className="absolute top-2 right-2 size-4 text-primary"
                    strokeWidth={3}
                  />
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
