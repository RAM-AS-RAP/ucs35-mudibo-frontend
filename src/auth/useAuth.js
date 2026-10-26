import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { signIn, signOut, verifyLoginCode, verifyRegistrationCode } from './auth';
import { LOGIN_PATH } from './paths';
import { useSession } from './session';

/**
 * The signed in user and the sign in and sign out actions.
 * `isSuperAdmin` comes from `is_super_admin` in the signed_in AuthResult and in GET /auth/me.
 */
export function useAuth() {
  const session = useSession();
  const navigate = useNavigate();

  // `signed_in`: the session is stored. `code_required`: a login flow started (/login/code).
  const login = useCallback(
    (/** @type {string} */ email, /** @type {string} */ password) => signIn(email, password),
    [],
  );
  const verifyLogin = useCallback((/** @type {string} */ code) => verifyLoginCode(code), []);
  const verifyRegistration = useCallback(
    (/** @type {string} */ code) => verifyRegistrationCode(code),
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
    userId: session?.userId ?? null,
    mustChangePassword: Boolean(session?.mustChangePassword),
    isSuperAdmin: Boolean(session?.isSuperAdmin),
    login,
    verifyLogin,
    verifyRegistration,
    logout,
  };
}
