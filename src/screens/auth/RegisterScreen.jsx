import { Link } from 'react-router';
import { AuthPlaceholder } from '@/components/layout/AuthPlaceholder';

/** Placeholder: farmer and buyer registration is built in F1. */
export default function RegisterScreen() {
  return (
    <AuthPlaceholder title="Create an account">
      <Link className="flex min-h-11 items-center text-primary underline" to="/login">
        Back to log in
      </Link>
    </AuthPlaceholder>
  );
}
