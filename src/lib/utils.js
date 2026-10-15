import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names (the shadcn/ui helper).
 * @param {...import('clsx').ClassValue} inputs
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
