import { AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** @param {string} id */
export const hintId = (id) => `${id}-hint`;
/** @param {string} id */
export const errorId = (id) => `${id}-error`;

/**
 * The ids an input should list in aria-describedby.
 * @param {string} id
 * @param {{ hint?: boolean, error?: boolean, extra?: string[] }} parts
 */
export function describedBy(id, { hint = false, error = false, extra = [] }) {
  const ids = [...(hint ? [hintId(id)] : []), ...extra, ...(error ? [errorId(id)] : [])];
  return ids.length ? ids.join(' ') : undefined;
}

/**
 * Helper text under a field.
 * @param {{ id: string, children: import('react').ReactNode }} props
 */
export function FieldHint({ id, children }) {
  return (
    <p id={hintId(id)} className="text-sm text-text-secondary">
      {children}
    </p>
  );
}

/**
 * A field's error: an icon and text in negative-text (never colour alone).
 * @param {{ id: string, message?: string | null }} props
 */
export function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={errorId(id)} className="flex items-start gap-1.5 text-sm font-medium text-negative-text">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
      <span>{message}</span>
    </p>
  );
}

/**
 * A labelled text input with optional hint and error. Labels are always visible.
 * Extra props (from React Hook Form's register) go to the input.
 * @param {import('react').ComponentProps<'input'> & {
 *   id: string,
 *   label: string,
 *   hint?: import('react').ReactNode,
 *   error?: string | null,
 * }} props
 */
export function FormField({ id, label, hint, error, className, ...inputProps }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { hint: Boolean(hint), error: Boolean(error) })}
        {...inputProps}
      />
      {hint && <FieldHint id={id}>{hint}</FieldHint>}
      <FieldError id={id} message={error} />
    </div>
  );
}
