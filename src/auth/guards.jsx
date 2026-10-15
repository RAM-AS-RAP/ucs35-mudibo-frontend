/**
 * Route guards. These only decide what the UI shows: the server remains the real
 * authority and checks the role and the password change rule on every request.
 */
import { Navigate, Outlet, useLocation } from 'react-router';
import ForbiddenScreen from '@/screens/shared/ForbiddenScreen';
import { useSession } from './session';
import { homeForRole } from './roles';

export const CHANGE_PASSWORD_PATH = '/change-password';
export const LOGIN_PATH = '/login';

/**
 * Signed in users only. Anonymous visitors go to /login with the intended path kept in
 * router state (never in the URL). A session that must change its password can only
 * reach /change-password (logout stays available from that screen).
 * @param {{ children?: import('react').ReactNode }} props
 */
export function RequireAuth({ children }) {
  const session = useSession();
  const location = useLocation();

  if (!session) {
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />;
  }
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
 * Public pages (login, register, password reset, accept invite). A signed in user is sent
 * to their role home, or to /change-password when that is required.
 * @param {{ children?: import('react').ReactNode }} props
 */
export function PublicOnly({ children }) {
  const session = useSession();
  if (session) {
    if (session.mustChangePassword) return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
    const home = homeForRole(session.role);
    return home ? <Navigate to={home} replace /> : <ForbiddenScreen />;
  }
  return children ?? <Outlet />;
}
