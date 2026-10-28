import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The elevation scale from tokens.css (shadow-card, shadow-raised) are shadow sizes, so a later
// shadow class (for example shadow-none) replaces them instead of being kept beside them.
const twMerge = extendTailwindMerge({
  extend: { theme: { shadow: ['card', 'raised'] } },
});

/**
 * Merge class names (the shadcn/ui helper).
 * @param {...import('clsx').ClassValue} inputs
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
