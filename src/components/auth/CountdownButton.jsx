import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MESSAGES } from '@/lib/messages';

/**
 * A button that is disabled while a wait (429 Retry-After or a resend cooldown) counts down,
 * showing "Try again in 42 s". Screen readers hear the wait once when it starts and once when
 * it ends: the second by second text is not in a live region.
 * Also shows a spinner and stays disabled while `pending` (no double submit).
 * `announceStart={false}` leaves the start of the wait to the caller (the payment screen puts
 * its own wait message in its status region, so the wait is announced once).
 * `waitingLabel` and `doneAnnouncement` replace the "Try again in N s" texts (the resend control
 * reads "Send a new code in N s").
 * @param {import('react').ComponentProps<typeof Button> & {
 *   remaining: number,
 *   pending?: boolean,
 *   pendingLabel?: string,
 *   announceStart?: boolean,
 *   waitingLabel?: (seconds: number) => string,
 *   doneAnnouncement?: string,
 * }} props
 */
export function CountdownButton({
  remaining,
  pending = false,
  pendingLabel,
  announceStart = true,
  waitingLabel = MESSAGES.form.tryAgainIn,
  doneAnnouncement = MESSAGES.form.countdownDone,
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
    let next = doneAnnouncement;
    if (active) next = announceStart ? MESSAGES.form.countdownStart(remaining) : '';
    setAnnouncement(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `remaining` is read at the start only
  }, [active]);

  let label = children;
  if (active) label = waitingLabel(remaining);
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
