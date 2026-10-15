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
        'flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-8 text-text-secondary" />
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {description && <p className="max-w-prose text-text-secondary">{description}</p>}
      {action}
    </div>
  );
}
