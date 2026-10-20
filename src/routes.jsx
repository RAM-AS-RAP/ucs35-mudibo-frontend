/**
 * The route table, in one place. Role areas are lazily loaded so a farmer never
 * downloads admin code. Guards decide what the UI shows; the server is the authority.
 */
import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router';
import { setNavigator } from '@/api/client';
import { PublicOnly, RequireAuth, RequireRole } from '@/auth/guards';
import { PUBLIC_HOME, ROLES } from '@/auth/roles';
import { AppShell } from '@/components/layout/AppShell';
import { RouteErrorBoundary, RouteErrorElement } from '@/components/feedback/ErrorBoundary';
import { LoadingState } from '@/components/feedback/LoadingState';
import LoginScreen from '@/screens/auth/LoginScreen';
import RegisterScreen from '@/screens/auth/RegisterScreen';
import ForgotPasswordScreen from '@/screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '@/screens/auth/ResetPasswordScreen';
import AcceptInviteScreen from '@/screens/auth/AcceptInviteScreen';
import ChangePasswordScreen from '@/screens/auth/ChangePasswordScreen';
import NotFoundScreen from '@/screens/shared/NotFoundScreen';

// Farmer screens: each lazily loaded. The trend chart loads Recharts lazily on top of that, and
// the listing form loads the photo helper (lib/image.js) lazily when a photo is chosen.
const DashboardScreen = lazy(() => import('@/screens/farmer/DashboardScreen'));
const PricesScreen = lazy(() => import('@/screens/farmer/PricesScreen'));
const ForecastScreen = lazy(() => import('@/screens/farmer/ForecastScreen'));
const MyListingsScreen = lazy(() => import('@/screens/farmer/MyListingsScreen'));
const CreateListingScreen = lazy(() => import('@/screens/farmer/CreateListingScreen'));
const EditListingScreen = lazy(() => import('@/screens/farmer/EditListingScreen'));
const OrdersScreen = lazy(() => import('@/screens/farmer/OrdersScreen'));
const BuyerHomeScreen = lazy(() => import('@/screens/buyer/BuyerHomeScreen'));
const AdminHomeScreen = lazy(() => import('@/screens/admin/AdminHomeScreen'));

// Development only. In production builds this is null and the module is not bundled.
const DevRoleSwitcher = import.meta.env.DEV ? lazy(() => import('@/dev/DevRoleSwitcher')) : null;

/** Top level layout: lets the API layer navigate (401 and 403 handling) through the router. */
function RootLayout() {
  const navigate = useNavigate();
  useEffect(() => {
    setNavigator((path) => navigate(path, { replace: true }));
  }, [navigate]);
  return (
    <>
      <Outlet />
      {DevRoleSwitcher && (
        <Suspense fallback={null}>
          <DevRoleSwitcher />
        </Suspense>
      )}
    </>
  );
}

/** @param {{ role: string }} props */
function RoleLayout({ role }) {
  return (
    <RequireAuth>
      <RequireRole roles={[role]}>
        <AppShell>
          <RouteErrorBoundary>
            <Suspense fallback={<LoadingState label="Loading page…" />}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </AppShell>
      </RequireRole>
    </RequireAuth>
  );
}

/** @param {import('react').ReactElement} element */
function roleChildren(element) {
  return [
    { index: true, element },
    { path: '*', element },
  ];
}

/** @type {import('react-router').RouteObject[]} */
export const routes = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorElement />,
    children: [
      { path: '/', element: <Navigate to={PUBLIC_HOME} replace /> },
      {
        element: <PublicOnly />,
        children: [
          { path: '/login', element: <LoginScreen /> },
          { path: '/register', element: <RegisterScreen /> },
          { path: '/forgot-password', element: <ForgotPasswordScreen /> },
        ],
      },
      // Reachable with or without a session: they show SignedInNotice when signed in.
      { path: '/reset-password', element: <ResetPasswordScreen /> },
      { path: '/accept-invite', element: <AcceptInviteScreen /> },
      {
        path: '/change-password',
        element: (
          <RequireAuth>
            <ChangePasswordScreen />
          </RequireAuth>
        ),
      },
      {
        path: '/farmer',
        element: <RoleLayout role={ROLES.FARMER} />,
        children: [
          { index: true, element: <DashboardScreen /> },
          { path: 'prices', element: <PricesScreen /> },
          { path: 'forecast', element: <ForecastScreen /> },
          { path: 'listings', element: <MyListingsScreen /> },
          { path: 'listings/new', element: <CreateListingScreen /> },
          { path: 'listings/:id/edit', element: <EditListingScreen /> },
          { path: 'orders', element: <OrdersScreen /> },
          { path: '*', element: <NotFoundScreen embedded /> },
        ],
      },
      {
        path: '/buyer',
        element: <RoleLayout role={ROLES.BUYER} />,
        children: roleChildren(<BuyerHomeScreen />),
      },
      {
        path: '/admin',
        element: <RoleLayout role={ROLES.ADMIN} />,
        children: roleChildren(<AdminHomeScreen />),
      },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
];
