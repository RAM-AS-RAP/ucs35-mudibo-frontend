import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * A radio style segmented control (crop, horizon, time range) built on native radio inputs, so
 * Tab reaches the group and the arrow keys move the choice. Every option is at least 44 px high.
 * @template {string} T
 * @param {{
 *   legend: string,
 *   options: ReadonlyArray<{ value: T, label: string }>,
 *   value: T,
 *   onChange: (value: T) => void,
 *   name?: string,
 *   className?: string,
 * }} props
 */
export function Segmented({ legend, options, value, onChange, name, className }) {
  const autoName = useId();
  const groupName = name ?? autoName;
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <legend className="mb-1.5 text-sm font-medium text-text-secondary">{legend}</legend>
      <div className="flex w-full flex-wrap gap-1 rounded-lg border border-border bg-neutral-bg p-1 sm:w-fit">
        {options.map((option) => (
          // flex-auto: each option keeps its natural width and grows to fill its row, so a long
          // list wraps onto new rows instead of squeezing labels below the 44 px target.
          <label key={option.value} className="flex flex-auto sm:flex-none">
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex min-h-11 w-full min-w-11 cursor-pointer items-center justify-center rounded-md px-3 text-center text-base font-medium text-text transition-colors',
                'peer-checked:bg-primary peer-checked:text-on-primary',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring',
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
