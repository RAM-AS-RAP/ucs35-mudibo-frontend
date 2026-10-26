import { RefreshCw } from 'lucide-react';
import { useResendRemaining } from '@/auth/flow';
import { MESSAGES } from '@/lib/messages';
import { CountdownButton } from './CountdownButton';

const T = MESSAGES.code;

/**
 * "Send a new code" on the code screens. The remaining seconds come from the flow store
 * (a monotonic deadline set from the server's resend_available_in or a Retry-After), so the
 * countdown survives a remount. While it counts the button reads "Send a new code in N s";
 * screen readers hear only the end of the wait (the start is announced by the code screen's
 * own status message), never every second.
 * @param {{ onClick: () => void, pending?: boolean, disabled?: boolean }} props
 */
export function ResendCodeButton({ onClick, pending = false, disabled = false }) {
  const remaining = useResendRemaining();
  return (
    <CountdownButton
      type="button"
      variant="outline"
      remaining={remaining}
      pending={pending}
      pendingLabel={T.resendPending}
      announceStart={false}
      waitingLabel={T.resendIn}
      doneAnnouncement={T.resendReady}
      disabled={disabled}
      onClick={onClick}
    >
      {!pending && <RefreshCw aria-hidden="true" />}
      {T.resend}
    </CountdownButton>
  );
}
