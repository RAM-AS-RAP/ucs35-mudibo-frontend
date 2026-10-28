import { lazy, Suspense } from 'react';
import { isGoogleConfigured } from '@/lib/google/config';

// The Google button and its loader are a lazy chunk: the sign in screen (initial JavaScript)
// never contains the Google script address, and nothing loads when Google is not configured.
const GoogleSignInButton = lazy(() => import('./GoogleSignInButton'));

/**
 * The Google group on the sign in and registration screens, or nothing when Google sign in is
 * not configured (no UI, no script, no request).
 * @param {import('react').ComponentProps<typeof GoogleSignInButton>} props
 */
export function GoogleSignInSlot(props) {
  if (!isGoogleConfigured()) return null;
  return (
    <Suspense fallback={<div aria-hidden="true" className="min-h-32" />}>
      <GoogleSignInButton {...props} />
    </Suspense>
  );
}
