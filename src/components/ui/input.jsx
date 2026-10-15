import { cn } from '@/lib/utils';

/**
 * Text input. 16px text so mobile browsers do not zoom; 44px tall for touch.
 * @param {import('react').ComponentProps<'input'>} props
 */
function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex min-h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base text-text outline-none placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-negative',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
