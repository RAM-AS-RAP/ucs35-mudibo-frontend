import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiStatus } from '@/components/feedback/ApiStatus';
import { getLastClearReason } from '@/auth/session';
import { AuthPlaceholder } from '@/components/layout/AuthPlaceholder';

/** Placeholder: the login form is built in F1. */
export default function LoginScreen() {
  const expired = getLastClearReason() === 'expired';
  return (
    <AuthPlaceholder title="Log in" footer={<ApiStatus />}>
      {expired && (
        <Alert>
          <AlertDescription>Your session ended. Please log in again.</AlertDescription>
        </Alert>
      )}
      <nav aria-label="Account pages" className="flex flex-col gap-1">
        <Link className="flex min-h-11 items-center text-primary underline" to="/register">
          Create an account
        </Link>
        <Link className="flex min-h-11 items-center text-primary underline" to="/forgot-password">
          Forgot your password?
        </Link>
      </nav>
    </AuthPlaceholder>
  );
}
