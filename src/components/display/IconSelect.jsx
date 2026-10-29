import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A native select with a decorative icon on the left and a chevron on the right (the market
 * choice on New listing and Forecast). 48 px high, 16 px text. Every other prop, including `ref`
 * (React Hook Form's register), goes to the select.
 * @param {import('react').ComponentProps<'select'> & {
 *   icon: import('react').ComponentType<{ className?: string, 'aria-hidden'?: boolean | 'true' }>,
 *   wrapperClassName?: string,
 * }} props
 */
export function IconSelect({ icon: Icon, wrapperClassName, className, children, ...props }) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-primary"
      />
      <select
        className={cn(
          'flex min-h-12 w-full cursor-pointer appearance-none rounded-lg border border-input bg-card py-2 pr-10 pl-10 text-base text-text outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-negative',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-text-secondary"
      />
    </div>
  );
}
