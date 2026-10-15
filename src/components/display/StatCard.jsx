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
        'flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        {Icon && <Icon aria-hidden="true" className="size-5 text-text-secondary" />}
      </div>
      <p className="text-2xl font-bold text-text tabular-nums">{value}</p>
      {hint && <div className="text-sm text-text-secondary">{hint}</div>}
    </div>
  );
}
