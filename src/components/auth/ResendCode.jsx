import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ApiError, getUserMessage } from '@/api/errors';
import { MESSAGES } from '@/lib/messages';
import { useCountdown } from '@/lib/useCountdown';
import { CountdownButton } from './CountdownButton';
import { DEFAULT_RETRY_SECONDS } from './useServerProblem';
import { SuccessMessage } from './FormNotices';

/** Wait between two "send a new code" requests (the backend's resend cooldown is one minute). */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * "Send me a new code": calls the request code endpoint (always 202 with a generic message),
 * shows the generic confirmation, then waits 60 seconds before it can be used again.
 * @param {{
 *   label: string,
 *   sentText: string,
 *   request: (email: string) => Promise<unknown>,
 *   getEmail: () => Promise<string | null>,  validates and returns the email field, or null
 * }} props
 */
export function ResendCode({ label, sentText, request, getEmail }) {
  const countdown = useCountdown();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  async function onClick() {
    const email = await getEmail();
    if (!email) return;
    setPending(true);
    setError(null);
    try {
      await request(email);
      setSent(true);
      countdown.start(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const seconds =
          err.retryAfter && err.retryAfter > 0 ? err.retryAfter : DEFAULT_RETRY_SECONDS;
        countdown.start(seconds);
        setError(MESSAGES.form.tooManyAttempts(seconds));
      } else {
        setError(getUserMessage(err));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <CountdownButton
        type="button"
        variant="outline"
        remaining={countdown.remaining}
        pending={pending}
        onClick={onClick}
      >
        {!pending && <RefreshCw aria-hidden="true" />}
        {label}
      </CountdownButton>
      {sent && !error && <SuccessMessage title="Sent">{sentText}</SuccessMessage>}
      {error && (
        <p role="alert" className="text-sm font-medium text-negative-text">
          {error}
        </p>
      )}
    </div>
  );
}
