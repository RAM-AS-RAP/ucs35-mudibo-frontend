import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { remainingSecondsUntil } from '@/lib/orderView';
import { ORDER_SCREEN_TEXT } from '@/lib/buyerMessages';

/**
 * The polite live region of the countdown: it only ever holds the 60 second, 30 second and
 * expiry messages, never the ticking time.
 * @param {{ text: string }} props
 */
export function CountdownAnnouncement({ text }) {
  return (
    <p role="status" aria-live="polite" className="sr-only" data-testid="countdown-announcement">
      {text}
    </p>
  );
}

/** Seconds as "mm:ss": 299 -> "04:59". */
export function formatCountdown(/** @type {number} */ seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * "Complete payment within mm:ss", counted on the server's clock: the time left is
 * `expires_at` minus (device time + offsetMs), recomputed every second by one interval that is
 * cleared on unmount. Screen readers hear it only at 60 seconds, 30 seconds and at the end
 * (an aria-live="polite" region); the visible timer itself is not live. `onExpired` is called
 * once when the time reaches zero.
 *
 * With `onAnnounce`, the announcements go to the screen's own live region instead: the order
 * screen keeps that region mounted, because the countdown itself is removed as soon as the
 * order turns expired and an announcement inside it would be lost.
 * @param {{
 *   expiresAt: string,
 *   offsetMs: number,
 *   onExpired?: () => void,
 *   onAnnounce?: (text: string) => void,
 * }} props
 */
export function ExpiryCountdown({ expiresAt, offsetMs, onExpired, onAnnounce }) {
  const [remaining, setRemaining] = useState(() =>
    remainingSecondsUntil(expiresAt, { nowMs: Date.now(), offsetMs }),
  );
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef(remaining);
  const expiredCalled = useRef(false);
  const onExpiredRef = useRef(onExpired);
  const onAnnounceRef = useRef(onAnnounce);
  // The latest clock inputs; the interval reads them, so a refetch never restarts it.
  const clock = useRef({ expiresAt, offsetMs });

  useEffect(() => {
    onExpiredRef.current = onExpired;
    onAnnounceRef.current = onAnnounce;
    clock.current = { expiresAt, offsetMs };
  }, [onExpired, onAnnounce, expiresAt, offsetMs]);

  useEffect(() => {
    /** Recompute, announce a threshold when crossed, and report the end once. */
    const say = (/** @type {string} */ text) =>
      onAnnounceRef.current ? onAnnounceRef.current(text) : setAnnouncement(text);
    const tick = () => {
      const next = remainingSecondsUntil(clock.current.expiresAt, {
        nowMs: Date.now(),
        offsetMs: clock.current.offsetMs,
      });
      const before = previous.current;
      previous.current = next;
      setRemaining(next);
      if (before > 60 && next <= 60 && next > 30) say(ORDER_SCREEN_TEXT.countdown60);
      else if (before > 30 && next <= 30 && next > 0) say(ORDER_SCREEN_TEXT.countdown30);
      else if (before > 0 && next === 0) say(ORDER_SCREEN_TEXT.countdownExpired);
      if (next === 0 && !expiredCalled.current) {
        expiredCalled.current = true;
        onExpiredRef.current?.();
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <p
        className="flex items-center gap-2 text-lg font-semibold text-text tabular-nums"
        data-testid="expiry-countdown"
      >
        <Timer aria-hidden="true" className="size-5 shrink-0 text-primary" />
        <span>{ORDER_SCREEN_TEXT.countdown(formatCountdown(remaining))}</span>
      </p>
      {!onAnnounce && <CountdownAnnouncement text={announcement} />}
    </div>
  );
}
