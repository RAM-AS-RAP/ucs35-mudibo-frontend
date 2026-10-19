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
          <label key={option.value} className="flex min-w-0 flex-1 sm:flex-none">
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
                'flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md px-4 text-base font-medium text-text transition-colors',
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
