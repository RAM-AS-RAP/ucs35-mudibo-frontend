import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MESSAGES } from '@/lib/messages';

/**
 * A button that is disabled while a wait (429 Retry-After or a resend cooldown) counts down,
 * showing "Try again in 42 s". Screen readers hear the wait once when it starts and once when
 * it ends: the second by second text is not in a live region.
 * Also shows a spinner and stays disabled while `pending` (no double submit).
 * @param {import('react').ComponentProps<typeof Button> & {
 *   remaining: number,
 *   pending?: boolean,
 *   pendingLabel?: string,
 * }} props
 */
export function CountdownButton({
  remaining,
  pending = false,
  pendingLabel,
  disabled,
  children,
  ...props
}) {
  const active = remaining > 0;
  const [announcement, setAnnouncement] = useState('');
  const wasActive = useRef(active);

  useEffect(() => {
    if (active === wasActive.current) return;
    wasActive.current = active;
    // Only on the transitions, never on each tick.
    setAnnouncement(active ? MESSAGES.form.countdownStart(remaining) : MESSAGES.form.countdownDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `remaining` is read at the start only
  }, [active]);

  let label = children;
  if (active) label = MESSAGES.form.tryAgainIn(remaining);
  else if (pending && pendingLabel) label = pendingLabel;

  return (
    <>
      <Button disabled={disabled || pending || active} {...props}>
        {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
        {label}
      </Button>
      <span role="status" aria-live="polite" className="sr-only" data-countdown-status="">
        {announcement}
      </span>
    </>
  );
}

/**
 * The submit button of an auth form: spinner and disabled while pending, countdown after 429.
 * @param {Omit<import('react').ComponentProps<typeof CountdownButton>, 'remaining'> & { remaining?: number }} props
 */
export function SubmitButton({ remaining = 0, ...props }) {
  return <CountdownButton type="submit" className="w-full" remaining={remaining} {...props} />;
}
