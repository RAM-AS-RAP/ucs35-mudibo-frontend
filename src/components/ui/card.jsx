import { cn } from '@/lib/utils';

function Card({ className, ...props }) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-4 rounded-2xl border border-border bg-card py-5 text-card-foreground shadow-card',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 px-5', className)}
      {...props}
    />
  );
}

/** Renders an h2 by default; pass `as` to change the heading level. */
function CardTitle({ className, as: Tag = 'h2', ...props }) {
  return (
    <Tag
      data-slot="card-title"
      className={cn('text-lg leading-tight font-bold tracking-tight', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-text-secondary', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }) {
  return <div data-slot="card-content" className={cn('px-5', className)} {...props} />;
}

function CardFooter({ className, ...props }) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 px-5', className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
