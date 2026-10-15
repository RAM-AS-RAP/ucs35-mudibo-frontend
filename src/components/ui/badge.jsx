import { cva } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-sm font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-4',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        neutral: 'border-transparent bg-neutral-bg text-neutral-text',
        positive: 'border-positive bg-card text-positive-text',
        negative: 'border-negative bg-card text-negative-text',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-text',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

/**
 * @param {import('react').ComponentProps<'span'> & {
 *   variant?: 'default' | 'secondary' | 'neutral' | 'positive' | 'negative' | 'destructive' | 'outline',
 *   asChild?: boolean,
 * }} props
 */
function Badge({ className, variant, asChild = false, ...props }) {
  const Comp = asChild ? Slot.Root : 'span';
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
