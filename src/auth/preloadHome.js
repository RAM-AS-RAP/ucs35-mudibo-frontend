/**
 * Start downloading a role's home screen as soon as the sign in succeeds, while the profile
 * (GET /auth/me) is still loading, so the dashboard opens without waiting for its code.
 *
 * These are the same modules routes.jsx loads with React.lazy; the browser downloads each one
 * once, so a preload simply gives the route a head start. Only the signed in role's own screen
 * is loaded (a farmer never downloads admin code). A failed preload is ignored: the route
 * loads the module again and shows its own error.
 */
import { isKnownRole } from './roles';

const HOME_SCREENS = Object.freeze({
  farmer: () => import('@/screens/farmer/DashboardScreen'),
  buyer: () => import('@/screens/buyer/BrowseScreen'),
  admin: () => import('@/screens/admin/AdminDashboardScreen'),
});

/** @param {unknown} role */
export function preloadHome(role) {
  if (!isKnownRole(role)) return;
  HOME_SCREENS[role]().catch(() => {});
}
