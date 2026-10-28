import { Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The green banner at the top of a dashboard: a greeting, the page title (the screen's h1, so
 * pass `headingRef` from usePageTitle), a short description and actions. Buttons on it use
 * `heroButton` and `heroOutlineButton` so they stay readable on the green.
 * @param {{
 *   greeting?: string,
 *   title: string,
 *   description?: string,
 *   headingRef?: import('react').Ref<HTMLHeadingElement>,
 *   actions?: import('react').ReactNode,
 *   aside?: import('react').ReactNode,
 *   className?: string,
 * }} props  aside: content on the right from the `md` breakpoint (for example key figures)
 */
export function DashboardHero({
  greeting,
  title,
  description,
  headingRef,
  actions,
  aside,
  className,
}) {
  return (
    <div
      className={cn(
        'bg-brand relative overflow-hidden rounded-2xl px-5 py-6 text-on-primary shadow-raised sm:px-8 sm:py-8',
        className,
      )}
    >
      <div aria-hidden="true" className="bg-dot-grid pointer-events-none absolute inset-0" />
      <Sprout
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -bottom-10 size-48 text-on-primary opacity-10 sm:size-56"
      />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            {greeting && <p className="text-lg font-medium text-on-primary-muted">{greeting}</p>}
            <h1
              ref={headingRef}
              tabIndex={headingRef ? -1 : undefined}
              className="text-3xl font-extrabold tracking-tight outline-none sm:text-4xl"
            >
              {title}
            </h1>
            {description && <p className="max-w-lg text-on-primary-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {aside}
      </div>
    </div>
  );
}

/**
 * The compact green banner at the top of a section screen (Prices, Forecast, My listings,
 * Orders): the page icon in a tile, the title (the screen's h1, pass `headingRef`), one line of
 * description and the page's main actions on the right. A larger copy of the icon decorates the
 * corner. Lower than the dashboard hero, so the screen's content stays near the top.
 * @param {{
 *   title: string,
 *   description?: string,
 *   icon: import('react').ComponentType<{ className?: string, 'aria-hidden'?: boolean | 'true' }>,
 *   headingRef?: import('react').Ref<HTMLHeadingElement>,
 *   actions?: import('react').ReactNode,
 *   className?: string,
 * }} props
 */
export function PageHero({ title, description, icon: Icon, headingRef, actions, className }) {
  return (
    <div
      className={cn(
        'bg-brand relative overflow-hidden rounded-2xl px-5 py-5 text-on-primary shadow-raised sm:px-6 sm:py-6',
        className,
      )}
    >
      <div aria-hidden="true" className="bg-dot-grid pointer-events-none absolute inset-0" />
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute -right-4 -bottom-8 size-36 text-on-primary opacity-[0.08]"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-card/15 ring-1 ring-card/20">
            <Icon aria-hidden="true" className="size-6" />
          </span>
          <div className="flex flex-col gap-1">
            <h1
              ref={headingRef}
              tabIndex={headingRef ? -1 : undefined}
              className="text-2xl font-extrabold tracking-tight outline-none sm:text-3xl"
            >
              {title}
            </h1>
            {description && <p className="max-w-xl text-on-primary-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** The main button on the hero: white with green text. */
export const heroButton = 'bg-card text-primary hover:bg-primary-soft focus-visible:ring-card';

/** The second button on the hero: outlined in pale green, white text. */
export const heroOutlineButton =
  'border-on-primary-muted bg-transparent text-on-primary shadow-none hover:border-card hover:bg-card/10 hover:text-on-primary focus-visible:ring-card';
