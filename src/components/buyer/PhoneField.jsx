import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describedBy, FieldError, FieldHint } from '@/components/auth/FormField';
import { ORDER_SCREEN_TEXT } from '@/lib/buyerMessages';

/**
 * The M-Pesa number of a payment. A controlled input whose value lives only in the order
 * screen's state: the buyer always types it; it is never stored or prefilled. Only leading and trailing
 * spaces are removed (on blur); spaces and dashes inside the number are kept as typed.
 * 16 px text and 44 px tall (the shared Input); the hint and the error are linked with
 * aria-describedby, and the error has an icon (never colour alone).
 * @param {{
 *   id?: string,
 *   value: string,
 *   onChange: (value: string) => void,
 *   error?: string | null,
 *   disabled?: boolean,
 *   inputRef?: import('react').Ref<HTMLInputElement>,
 * }} props
 */
export function PhoneField({ id = 'mpesa-phone', value, onChange, error, disabled, inputRef }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{ORDER_SCREEN_TEXT.phoneLabel}</Label>
      <Input
        id={id}
        ref={inputRef}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={20}
        className="sm:max-w-xs"
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { hint: true, error: Boolean(error) })}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => {
          const trimmed = event.target.value.trim();
          if (trimmed !== event.target.value) onChange(trimmed);
        }}
      />
      <FieldHint id={id}>{ORDER_SCREEN_TEXT.phoneHint}</FieldHint>
      <FieldError id={id} message={error} />
    </div>
  );
}
