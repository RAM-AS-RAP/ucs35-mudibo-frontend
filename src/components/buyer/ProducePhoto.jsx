import { Leaf } from 'lucide-react';
import { safeImageUrl } from '@/lib/safeImageUrl';
import { cn } from '@/lib/utils';

/**
 * A listing photo for the buyer screens, or a leaf placeholder when there is none or the URL is
 * not safe (only https, or localhost in development, through safeImageUrl).
 * @param {{ imageUrl: string | null | undefined, alt: string, className?: string, eager?: boolean }} props
 */
export function ProducePhoto({ imageUrl, alt, className, eager = false }) {
  const src = safeImageUrl(imageUrl);
  if (!src) {
    return (
      <div
        className={cn(
          'flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-neutral-bg',
          className,
        )}
        data-testid="produce-photo-placeholder"
      >
        <Leaf aria-hidden="true" className="size-10 text-primary" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('aspect-[4/3] w-full rounded-lg bg-neutral-bg object-cover', className)}
    />
  );
}
