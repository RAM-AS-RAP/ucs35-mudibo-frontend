import { FlaskConical, KeyRound } from 'lucide-react';
import { SANDBOX_TEXT } from '@/lib/buyerMessages';

/**
 * The research prototype notice under the checkout and payment buttons: the response's `note`
 * when the server sent one, and the PIN warning. AgriSence never asks for an M-Pesa PIN.
 * @param {{ note?: string | null }} props
 */
export function SandboxNote({ note }) {
  const text = typeof note === 'string' && note.trim() ? note.trim() : SANDBOX_TEXT.fallback;
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-border bg-neutral-bg p-4 text-sm text-neutral-text"
      data-testid="sandbox-note"
    >
      <p className="flex items-start gap-2">
        <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{text}</span>
      </p>
      <p className="flex items-start gap-2 font-medium">
        <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{SANDBOX_TEXT.pin}</span>
      </p>
    </div>
  );
}
