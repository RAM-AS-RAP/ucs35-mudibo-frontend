import { cva } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

// Sizes keep touch targets at least 44 by 44 pixels.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-base font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none motion-safe:active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-card hover:bg-primary-hover hover:shadow-raised active:bg-primary-hover',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
        outline:
          'border border-border bg-card text-text shadow-card hover:border-primary hover:bg-primary-soft hover:text-primary',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-border',
        ghost: 'text-text hover:bg-primary-soft hover:text-primary',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-11 px-4 py-2',
        sm: 'min-h-11 px-3',
        lg: 'min-h-12 px-6',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

/**
 * @param {import('react').ComponentProps<'button'> & {
 *   variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link',
 *   size?: 'default' | 'sm' | 'lg' | 'icon',
 *   asChild?: boolean,
 * }} props
 */
function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
