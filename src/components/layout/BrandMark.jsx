import { Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The AgriSence logo: the sprout in a green tile and the wordmark. Decorative icon, the
 * wordmark is the text. `inverse` is for the green brand surface (white tile, white text).
 * @param {{ size?: 'md' | 'lg', inverse?: boolean, className?: string }} props
 */
export function BrandMark({ size = 'md', inverse = false, className }) {
  const large = size === 'lg';
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl shadow-card',
          large ? 'size-11' : 'size-9',
          inverse ? 'bg-card text-primary' : 'bg-brand text-on-primary',
        )}
      >
        <Sprout aria-hidden="true" className={large ? 'size-6' : 'size-5'} />
      </span>
      <span
        className={cn(
          'font-extrabold tracking-tight',
          large ? 'text-2xl' : 'text-xl',
          inverse ? 'text-on-primary' : 'text-primary',
        )}
      >
        AgriSence
      </span>
    </span>
  );
}
