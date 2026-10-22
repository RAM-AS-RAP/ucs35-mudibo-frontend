import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ADMIN_COMMON } from '@/lib/adminMessages';
import { cn } from '@/lib/utils';

/**
 * @typedef {object} FilterRule  how one URL query parameter is read
 * @property {readonly string[]} [values]  the allowed values (a choice); others fall back
 * @property {string} [fallback]  the default of a choice (never written to the URL)
 * @property {(value: string) => boolean} [accept]  a free value is kept only when this is true
 */

/**
 * The filters of a list screen, held in the URL query string and validated against their
 * allowed values. Invalid values are removed from the URL (replace, no new history entry).
 * A choice reads as its value or its fallback; a free value reads as the string or null.
 * @template {Record<string, FilterRule>} S
 * @param {S} rules
 * @returns {{
 *   values: { [K in keyof S]: string | null },
 *   set: (change: Partial<{ [K in keyof S]: string | null }>) => void,
 *   clear: () => void,
 *   active: boolean,
 * }}
 */
export function useFilterParams(rules) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    /** @type {Record<string, string | null>} */
    const read = {};
    for (const [key, rule] of Object.entries(rules)) {
      const raw = params.get(key);
      if (rule.values) {
        read[key] = raw !== null && rule.values.includes(raw) ? raw : (rule.fallback ?? null);
      } else {
        read[key] = raw !== null && raw !== '' && (!rule.accept || rule.accept(raw)) ? raw : null;
      }
    }
    return read;
  }, [params, rules]);

  const toParams = useCallback(
    (/** @type {Record<string, string | null>} */ next) => {
      const out = new URLSearchParams();
      for (const [key, rule] of Object.entries(rules)) {
        const value = next[key];
        if (value === null || value === undefined || value === '') continue;
        if (rule.values && value === rule.fallback) continue;
        out.set(key, value);
      }
      return out;
    },
    [rules],
  );

  // Remove invalid or redundant values from the URL.
  useEffect(() => {
    const clean = toParams(values);
    if (clean.toString() !== params.toString()) setParams(clean, { replace: true });
  }, [params, setParams, toParams, values]);

  const set = useCallback(
    (/** @type {Record<string, string | null>} */ change) =>
      setParams(toParams({ ...values, ...change }), { replace: true }),
    [setParams, toParams, values],
  );
  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);
  const active = toParams(values).toString() !== '';

  return /** @type {any} */ ({ values, set, clear, active });
}

/**
 * The labelled filter area of a list screen (a search landmark) with "Clear filters" while any
 * filter is set.
 * @param {{
 *   label: string,
 *   active: boolean,
 *   onClear: () => void,
 *   children: import('react').ReactNode,
 *   className?: string,
 * }} props
 */
export function FilterBar({ label, active, onClear, children, className }) {
  return (
    <div
      role="search"
      aria-label={label}
      className={cn('flex flex-col gap-4 rounded-xl border border-border bg-card p-4', className)}
    >
      {children}
      {active && (
        <Button type="button" variant="ghost" className="w-fit" onClick={onClear}>
          <X aria-hidden="true" />
          {ADMIN_COMMON.clearFilters}
        </Button>
      )}
    </div>
  );
}

/** Class of the native selects on the admin screens (16 px text, 44 px high). */
export const SELECT_CLASS =
  'flex min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base text-text outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
