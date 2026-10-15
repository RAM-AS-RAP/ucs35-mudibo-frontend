import { Link } from 'react-router';
import { AuthPlaceholder } from '@/components/layout/AuthPlaceholder';

/** Placeholder: accepting an admin invitation is built in F1. */
export default function AcceptInviteScreen() {
  return (
    <AuthPlaceholder title="Accept your invitation">
      <Link className="flex min-h-11 items-center text-primary underline" to="/login">
        Back to log in
      </Link>
    </AuthPlaceholder>
  );
}
