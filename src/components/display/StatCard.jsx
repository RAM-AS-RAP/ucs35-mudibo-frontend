import { cn } from '@/lib/utils';

/** Icon tile colours, shared with other dashboard tiles. */
export const TILE_TONES = Object.freeze({
  primary: 'bg-primary-soft text-primary',
  gold: 'bg-accent-gold-soft text-accent-gold-text',
  neutral: 'bg-neutral-bg text-neutral-text',
});

/**
 * A labelled figure, for example "Current price" and "KES 45.50".
 * @param {{
 *   label: string,
 *   value: import('react').ReactNode,
 *   hint?: import('react').ReactNode,
 *   icon?: import('react').ComponentType<{ className?: string, 'aria-hidden'?: boolean | 'true' }>,
 *   tone?: 'primary' | 'gold' | 'neutral',
 *   className?: string,
 * }} props  tone: the icon tile's colour (decoration only; the label carries the meaning)
 */
export function StatCard({ label, value, hint, icon: Icon, tone = 'primary', className }) {
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
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl',
              TILE_TONES[tone],
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
          </span>
        )}
      </div>
      <p className="text-3xl font-extrabold tracking-tight text-text tabular-nums">{value}</p>
      {hint && <div className="text-sm text-text-secondary">{hint}</div>}
    </div>
  );
}
