import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ADMIN_COMMON } from '@/lib/adminMessages';

/** Wait this long after the last keystroke before searching. */
export const SEARCH_DEBOUNCE_MS = 400;

/**
 * A search field for an admin list. The search applies 400 ms after the last keystroke. An
 * empty field clears the search; a text shorter than `min` characters shows a message and
 * sends no request (the current results stay). At most `max` characters can be typed.
 * @param {{
 *   label: string,
 *   value: string | null,
 *   onSearch: (text: string | null) => void,
 *   min?: number,
 *   max?: number,
 *   shortMessage?: string,
 *   className?: string,
 * }} props  value: the search applied now (from the URL)
 */
export function SearchInput({
  label,
  value,
  onSearch,
  min = 2,
  max = 50,
  shortMessage,
  className,
}) {
  const id = useId();
  const [text, setText] = useState(value ?? '');
  const applied = useRef(value ?? '');

  // A search changed elsewhere (for example "Clear filters") replaces the typed text.
  useEffect(() => {
    if ((value ?? '') !== applied.current) {
      applied.current = value ?? '';
      setText(value ?? '');
    }
  }, [value]);

  const trimmed = text.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < min;

  useEffect(() => {
    if (tooShort || trimmed === applied.current) return undefined;
    const timer = setTimeout(() => {
      applied.current = trimmed;
      onSearch(trimmed === '' ? null : trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, tooShort, onSearch]);

  const messageId = `${id}-message`;
  return (
    <div className={className}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="search"
          autoComplete="off"
          maxLength={max}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-describedby={tooShort ? messageId : undefined}
        />
      </div>
      <div aria-live="polite" className="empty:hidden">
        {tooShort && (
          <p id={messageId} className="mt-1.5 flex items-start gap-1.5 text-sm text-text-secondary">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{shortMessage ?? ADMIN_COMMON.searchShort(min)}</span>
          </p>
        )}
      </div>
    </div>
  );
}
