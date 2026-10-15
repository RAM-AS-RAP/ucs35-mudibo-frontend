import { CheckCircle2, Info, WifiOff } from 'lucide-react';
import { MESSAGES } from '@/lib/messages';

/**
 * Shown above a form while the device is offline; the form's submit button is disabled.
 * @param {{ offline: boolean }} props
 */
export function OfflineFormNotice({ offline }) {
  if (!offline) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border bg-neutral-bg px-4 py-3 text-sm font-medium text-neutral-text">
      <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{MESSAGES.form.offline}</span>
    </p>
  );
}

/**
 * A success message: icon, the word "Success" for screen readers and sighted users alike,
 * and the text in positive-text (never colour alone). Announced politely.
 * @param {{ children: import('react').ReactNode, title?: string }} props
 */
export function SuccessMessage({ children, title = 'Success' }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-positive bg-card px-4 py-3 text-positive-text"
    >
      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-positive" />
      <p>
        <strong className="font-semibold">{title}: </strong>
        {children}
      </p>
    </div>
  );
}

/**
 * A neutral information message (for example the one time flash on the login screen).
 * @param {{ children: import('react').ReactNode }} props
 */
export function InfoMessage({ children }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-border bg-canvas px-4 py-3 text-text"
    >
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      <p>{children}</p>
    </div>
  );
}
