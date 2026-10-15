import { useNavigate } from 'react-router';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clear } from '@/auth/session';
import { AuthPlaceholder } from '@/components/layout/AuthPlaceholder';

/**
 * Placeholder: the change password form is built in F1. While a password change is required
 * this is the only reachable screen, so it always offers logout.
 */
export default function ChangePasswordScreen() {
  const navigate = useNavigate();
  return (
    <AuthPlaceholder title="Change your password">
      <p className="text-text-secondary">Please set a new password to continue.</p>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          clear('logout');
          navigate('/login', { replace: true });
        }}
      >
        <LogOut aria-hidden="true" />
        Log out
      </Button>
    </AuthPlaceholder>
  );
}
