import { CODE_LENGTH } from '@/lib/validation';
import { FormField } from './FormField';

/**
 * Tidy what is typed or pasted into a code field: upper case, no spaces, letters and digits
 * only, plus at most one hyphen (codes are shown as XXXX-XXXX). Keeps 8 characters.
 * @param {string} raw
 */
export function formatCodeInput(raw) {
  let out = '';
  let letters = 0;
  let hyphen = false;
  for (const char of raw.toUpperCase().replace(/\s+/g, '')) {
    if (/[A-Z0-9]/.test(char) && letters < CODE_LENGTH) {
      out += char;
      letters += 1;
    } else if (char === '-' && !hyphen && letters > 0 && letters < CODE_LENGTH) {
      out += char;
      hyphen = true;
    }
  }
  return out;
}

/**
 * The one time code field (password reset and invitation). Works with React Hook Form's
 * register: the value is tidied before the form sees it.
 * @param {import('react').ComponentProps<'input'> & {
 *   id: string,
 *   label: string,
 *   hint?: import('react').ReactNode,
 *   error?: string | null,
 * }} props
 */
export function CodeInput({ onChange, ...props }) {
  return (
    <FormField
      type="text"
      inputMode="text"
      autoComplete="one-time-code"
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      className="[&_input]:font-mono [&_input]:tracking-widest"
      {...props}
      onChange={(event) => {
        const tidy = formatCodeInput(event.target.value);
        if (tidy !== event.target.value) event.target.value = tidy;
        onChange?.(event);
      }}
    />
  );
}
