import { LogOut, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signOut } from '@/auth/auth';
import { useSession } from '@/auth/session';
import { MESSAGES } from '@/lib/messages';

/**
 * Shown on the invitation and reset screens when a session already exists. Signing out
 * keeps the visitor on the same screen, which then shows its form.
 */
export function SignedInNotice() {
  const session = useSession();
  const name = session?.name ?? MESSAGES.signedIn.someone;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-canvas px-4 py-3">
      <p className="flex items-start gap-2 text-text">
        <UserCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <span>{MESSAGES.signedIn.text(name)}</span>
      </p>
      <Button type="button" variant="outline" onClick={() => signOut()}>
        <LogOut aria-hidden="true" />
        {MESSAGES.signedIn.signOut}
      </Button>
    </div>
  );
}
