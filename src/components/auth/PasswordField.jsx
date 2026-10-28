import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { describedBy, FieldError, FieldHint } from './FormField';

/**
 * A password input with a show or hide toggle (a toggle button with aria-pressed and a fixed
 * accessible name). Paste is allowed. It takes no value or defaultValue: a password is never
 * filled in from application state.
 * @param {Omit<import('react').ComponentProps<'input'>, 'value' | 'defaultValue' | 'type'> & {
 *   id: string,
 *   label: string,
 *   autoComplete: 'current-password' | 'new-password',
 *   hint?: import('react').ReactNode,
 *   error?: string | null,
 *   describedByIds?: string[],
 *   children?: import('react').ReactNode,
 *   labelAction?: import('react').ReactNode,
 * }} props  children render under the field (for example PasswordRequirements);
 *   labelAction sits on the label's line, at the right (for example a "Forgot your password?" link)
 */
export function PasswordField({
  id,
  label,
  autoComplete,
  hint,
  error,
  describedByIds = [],
  className,
  children,
  labelAction,
  ...inputProps
}) {
  const [visible, setVisible] = useState(false);
  // Never let a caller pass a stored value through the spread.
  const {
    value: _value,
    defaultValue: _defaultValue,
    ...safeProps
  } = /** @type {Record<string, unknown>} */ (inputProps);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {labelAction ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <Label htmlFor={id}>{label}</Label>
          {labelAction}
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="pr-12"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, {
            hint: Boolean(hint),
            error: Boolean(error),
            extra: describedByIds,
          })}
          {...safeProps}
        />
        <button
          type="button"
          aria-pressed={visible}
          aria-controls={id}
          aria-label={`Show ${label.toLowerCase()}`}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex size-11 items-center justify-center rounded-md text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-5" />
          ) : (
            <Eye aria-hidden="true" className="size-5" />
          )}
        </button>
      </div>
      {hint && <FieldHint id={id}>{hint}</FieldHint>}
      <FieldError id={id} message={error} />
      {children}
    </div>
  );
}
