import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { signIn, signOut } from './auth';
import { LOGIN_PATH } from './paths';
import { useSession } from './session';

/**
 * The signed in user and the sign in and sign out actions.
 * `isSuperAdmin` comes from the profile only when the backend returns it (GET /auth/me does
 * not today), so it is false otherwise.
 */
export function useAuth() {
  const session = useSession();
  const navigate = useNavigate();

  const login = useCallback(
    (/** @type {string} */ identifier, /** @type {string} */ password) =>
      signIn(identifier, password),
    [],
  );

  const logout = useCallback(() => {
    signOut();
    navigate(LOGIN_PATH, { replace: true });
  }, [navigate]);

  return {
    session,
    isAuthenticated: Boolean(session),
    role: session?.role ?? null,
    name: session?.name ?? null,
    mustChangePassword: Boolean(session?.mustChangePassword),
    isSuperAdmin: Boolean(session?.isSuperAdmin),
    login,
    logout,
  };
}
