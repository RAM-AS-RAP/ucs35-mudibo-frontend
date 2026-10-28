import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Nothing to show yet.
 * @param {{
 *   title: string,
 *   description?: string,
 *   icon?: import('react').ComponentType<{ className?: string, 'aria-hidden'?: boolean | 'true' }>,
 *   action?: import('react').ReactNode,
 *   className?: string,
 * }} props
 */
export function EmptyState({ title, description, icon: Icon = Inbox, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary ring-8 ring-primary-soft/40">
        <Icon aria-hidden="true" className="size-8" />
      </span>
      <h2 className="text-lg font-bold text-text">{title}</h2>
      {description && <p className="max-w-prose text-text-secondary">{description}</p>}
      {action}
    </div>
  );
}
