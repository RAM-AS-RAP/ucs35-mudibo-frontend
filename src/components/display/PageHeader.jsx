import { cn } from '@/lib/utils';

/**
 * The page title (the h1 of a screen), an optional description and actions.
 * Pass `headingRef` (from usePageTitle) so focus can move to the heading on navigation.
 * @param {{ title: string, description?: string, actions?: import('react').ReactNode, className?: string, headingRef?: import('react').Ref<HTMLHeadingElement> }} props
 */
export function PageHeader({ title, description, actions, className, headingRef }) {
  return (
    <div
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="flex flex-col gap-1">
        <h1
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className="text-2xl font-extrabold tracking-tight text-text outline-none sm:text-3xl"
        >
          {title}
        </h1>
        {description && <p className="text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
