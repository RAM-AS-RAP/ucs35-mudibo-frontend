import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-base has-[>svg]:grid-cols-[calc(var(--spacing)*5)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-text [&>svg]:text-text',
        destructive: 'border-negative bg-card text-negative-text [&>svg]:text-negative',
        positive: 'border-positive bg-card text-positive-text [&>svg]:text-positive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

/**
 * @param {import('react').ComponentProps<'div'> & { variant?: 'default' | 'destructive' | 'positive' }} props
 */
function Alert({ className, variant, ...props }) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }) {
  return (
    <div data-slot="alert-title" className={cn('col-start-2 font-medium', className)} {...props} />
  );
}

function AlertDescription({ className, ...props }) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 grid justify-items-start gap-1 text-sm text-text-secondary',
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
