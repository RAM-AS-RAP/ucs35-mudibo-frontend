import { cn } from '@/lib/utils';

/**
 * A labelled figure, for example "Current price" and "KES 45.50".
 * @param {{
 *   label: string,
 *   value: import('react').ReactNode,
 *   hint?: import('react').ReactNode,
 *   icon?: import('react').ComponentType<{ className?: string, 'aria-hidden'?: boolean | 'true' }>,
 *   className?: string,
 * }} props
 */
export function StatCard({ label, value, hint, icon: Icon, className }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        {Icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Icon aria-hidden="true" className="size-5" />
          </span>
        )}
      </div>
      <p className="text-3xl font-extrabold tracking-tight text-text tabular-nums">{value}</p>
      {hint && <div className="text-sm text-text-secondary">{hint}</div>}
    </div>
  );
}
