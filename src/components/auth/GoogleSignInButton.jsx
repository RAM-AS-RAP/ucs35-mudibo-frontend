import { useEffect, useId, useRef } from 'react';
import { AlertTriangle, Info, LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGoogleSignIn } from '@/auth/useGoogleSignIn';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { CountdownButton } from './CountdownButton';

const T = MESSAGES.google;

/** Height of Google's large button, kept while it loads so the page does not jump. */
const BUTTON_AREA = 'min-h-11';

/**
 * "Or continue with Google" on the sign in and registration screens. Loaded lazily, and only
 * rendered by those screens when Google sign in is configured (isGoogleConfigured()).
 *
 * Google's button is an iframe controlled by Google: this app cannot style or label it. The
 * group, its heading, the helper text, the status region and the error region around it are
 * the accessible parts (docs/google-sign-in.md).
 *
 * While Google's answer is checked the button's place shows only a spinner, and `onBusyChange`
 * lets the screen grey out and disable its other controls. Each step (signing in, the greeting,
 * the slow connection line) is announced to screen readers but not shown as text.
 * @param {{
 *   context: 'login' | 'register',
 *   preferredRole?: 'farmer' | 'buyer' | null,
 *   from?: unknown,
 *   onBusyChange?: (busy: boolean) => void,
 * }} props  from: the screen's router state (only its `from` path is used)
 */
export function GoogleSignInButton({ context, preferredRole = null, from, onBusyChange }) {
  const headingId = useId();
  const containerRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const { phase, busy, opening, slow, problem, wait, retry, retryLoad } = useGoogleSignIn({
    preferredRole: context === 'register' ? preferredRole : null,
    from,
    containerRef,
  });
  const showButton = phase === 'ready' || phase === 'loading';

  // Tell the screen, which disables its own form meanwhile. Released when this unmounts.
  const busyListener = useRef(onBusyChange);
  useEffect(() => {
    busyListener.current = onBusyChange;
  });
  useEffect(() => {
    busyListener.current?.(busy);
  }, [busy]);
  useEffect(() => () => busyListener.current?.(false), []);

  const title =
    phase === 'opening' && opening
      ? opening.next === 'role'
        ? T.openingRole
        : T.openingAccount(opening.name)
      : T.signingIn;

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="flex flex-col gap-3"
      data-google-sign-in=""
    >
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
        <p id={headingId} className="text-sm font-medium text-text-secondary">
          {T.heading}
        </p>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

      {phase !== 'unavailable' && phase !== 'offline' && (
        <div
          className={cn('flex flex-col items-center justify-center', BUTTON_AREA, busy && 'hidden')}
        >
          {phase === 'loading' && <p className="text-sm text-text-secondary">{T.loading}</p>}
          <div
            ref={containerRef}
            hidden={!showButton}
            className="flex w-full justify-center"
            aria-hidden={phase === 'ready' ? undefined : true}
          />
        </div>
      )}

      {/* Always rendered, so screen readers announce each step as it changes. Sighted people
          see only the spinner (with the form disabled); the words are for screen readers. */}
      <div
        role="status"
        aria-live="polite"
        className={cn(busy && 'flex items-center justify-center', busy && BUTTON_AREA)}
      >
        {busy && (
          <>
            <LoaderCircle
              aria-hidden="true"
              className="size-8 animate-spin text-primary motion-reduce:animate-none"
            />
            <span className="sr-only">{slow ? `${title} ${T.slow}` : title}</span>
          </>
        )}
      </div>

      {phase === 'offline' && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-neutral-bg px-4 py-3 text-sm font-medium text-neutral-text">
          <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{MESSAGES.form.offline}</span>
        </p>
      )}

      {phase === 'unavailable' && (
        <p role="alert" className="flex items-start gap-2 text-sm font-medium text-text">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{T.unavailable}</span>
        </p>
      )}

      {phase === 'load_failed' && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="flex items-start gap-2 text-sm font-medium text-negative-text">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
            <span>{T.loadFailed}</span>
          </p>
          <Button type="button" variant="outline" onClick={retryLoad}>
            <RefreshCw aria-hidden="true" />
            {T.tryAgain}
          </Button>
        </div>
      )}

      {problem && phase !== 'load_failed' && phase !== 'unavailable' && (
        <p role="alert" className="flex items-start gap-2 text-sm font-medium text-negative-text">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
          <span>{problem}</span>
        </p>
      )}

      {phase === 'retry' && (
        <CountdownButton
          type="button"
          variant="outline"
          remaining={wait.remaining}
          disabled={wait.longWait}
          onClick={retry}
        >
          <RefreshCw aria-hidden="true" />
          {T.tryAgain}
        </CountdownButton>
      )}

    </div>
  );
}

export default GoogleSignInButton;
