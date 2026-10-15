/**
 * Route guards. These only decide what the UI shows: the server remains the real
 * authority and checks the role and the password change rule on every request.
 */
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import ForbiddenScreen from '@/screens/shared/ForbiddenScreen';
import { LoadingState } from '@/components/feedback/LoadingState';
import { MESSAGES } from '@/lib/messages';
import { useSession } from './session';
import { homeForRole } from './roles';
import { CHANGE_PASSWORD_PATH, LOGIN_PATH } from './paths';
import { revalidateSession, useRevalidationPending } from './revalidate';
import { usePublicRedirectHeld } from './auth';

export { CHANGE_PASSWORD_PATH, LOGIN_PATH };

/** Shown while a restored session is checked with GET /auth/me (at most 8 seconds). */
function CheckingSession() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center bg-canvas px-4 py-8 outline-none"
    >
      <LoadingState label={MESSAGES.layout.checkingSession} rows={2} />
    </main>
  );
}

/**
 * Signed in users only. Anonymous visitors go to /login with the intended path kept in
 * router state (never in the URL). A session that must change its password can only
 * reach /change-password (sign out stays available from that screen). A session restored
 * from storage is revalidated once before anything protected renders.
 * @param {{ children?: import('react').ReactNode }} props
 */
export function RequireAuth({ children }) {
  const session = useSession();
  const location = useLocation();
  const pending = useRevalidationPending();

  useEffect(() => {
    if (pending) revalidateSession();
  }, [pending]);

  if (!session) {
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />;
  }
  if (pending) return <CheckingSession />;
  if (session.mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  return children ?? <Outlet />;
}

/**
 * Only the given roles. The wrong role sees the Forbidden screen in place (no redirect loop).
 * @param {{ roles: string[], children?: import('react').ReactNode }} props
 */
export function RequireRole({ roles, children }) {
  const session = useSession();
  if (!session || !roles.includes(session.role)) return <ForbiddenScreen />;
  return children ?? <Outlet />;
}

/**
 * Public pages (login, register, forgot password). A signed in user is sent to their role
 * home, or to /change-password when that is required.
 * @param {{ children?: import('react').ReactNode }} props
 */
export function PublicOnly({ children }) {
  const session = useSession();
  const held = usePublicRedirectHeld();
  if (session && !held) {
    if (session.mustChangePassword) return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
    const home = homeForRole(session.role);
    return home ? <Navigate to={home} replace /> : <ForbiddenScreen />;
  }
  return children ?? <Outlet />;
}
