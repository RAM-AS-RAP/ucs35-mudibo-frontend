import { Link } from 'react-router';
import { AuthPlaceholder } from '@/components/layout/AuthPlaceholder';

/** Placeholder: entering the reset code and a new password is built in F1. */
export default function ResetPasswordScreen() {
  return (
    <AuthPlaceholder title="Reset your password">
      <Link className="flex min-h-11 items-center text-primary underline" to="/login">
        Back to log in
      </Link>
    </AuthPlaceholder>
  );
}
