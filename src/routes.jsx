/**
 * The route table, in one place. Role areas are lazily loaded so a farmer never
 * downloads admin code. Guards decide what the UI shows; the server is the authority.
 */
import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router';
import { setNavigator } from '@/api/client';
import { PublicOnly, RequireAuth, RequireRole, RequireSuperAdmin } from '@/auth/guards';
import { PUBLIC_HOME, ROLES } from '@/auth/roles';
import { AppShell } from '@/components/layout/AppShell';
import { RouteErrorBoundary, RouteErrorElement } from '@/components/feedback/ErrorBoundary';
import { LoadingState, PageLoadingState } from '@/components/feedback/LoadingState';
import LoginScreen from '@/screens/auth/LoginScreen';
import ChangePasswordScreen from '@/screens/auth/ChangePasswordScreen';
import NotFoundScreen from '@/screens/shared/NotFoundScreen';

// Registration, the code steps and password recovery (identity v2): lazily loaded, so the first
// screen most people see (sign in) stays small.
const RegisterScreen = lazy(() => import('@/screens/auth/RegisterScreen'));
const RegisterVerifyScreen = lazy(() => import('@/screens/auth/RegisterVerifyScreen'));
const LoginCodeScreen = lazy(() => import('@/screens/auth/LoginCodeScreen'));
const ForgotPasswordScreen = lazy(() => import('@/screens/auth/ForgotPasswordScreen'));
const ResetPasswordScreen = lazy(() => import('@/screens/auth/ResetPasswordScreen'));
const AcceptInviteScreen = lazy(() => import('@/screens/auth/AcceptInviteScreen'));
// Google sign in (prompt 6): the one time role choice, and the farmer and buyer account screens.
const GoogleRoleScreen = lazy(() => import('@/screens/auth/GoogleRoleScreen'));
const AccountSecurityScreen = lazy(() => import('@/screens/account/AccountSecurityScreen'));
const SetPasswordScreen = lazy(() => import('@/screens/account/SetPasswordScreen'));

// Farmer screens: each lazily loaded. The trend chart loads Recharts lazily on top of that, and
// the listing form loads the photo helper (lib/image.js) lazily when a photo is chosen.
const DashboardScreen = lazy(() => import('@/screens/farmer/DashboardScreen'));
const PricesScreen = lazy(() => import('@/screens/farmer/PricesScreen'));
const ForecastScreen = lazy(() => import('@/screens/farmer/ForecastScreen'));
const MyListingsScreen = lazy(() => import('@/screens/farmer/MyListingsScreen'));
const CreateListingScreen = lazy(() => import('@/screens/farmer/CreateListingScreen'));
const EditListingScreen = lazy(() => import('@/screens/farmer/EditListingScreen'));
const OrdersScreen = lazy(() => import('@/screens/farmer/OrdersScreen'));
// Buyer screens (F3): each lazily loaded, so farmers and admins never download them.
const BrowseScreen = lazy(() => import('@/screens/buyer/BrowseScreen'));
const ListingDetailScreen = lazy(() => import('@/screens/buyer/ListingDetailScreen'));
const OrderScreen = lazy(() => import('@/screens/buyer/OrderScreen'));
const MyOrdersScreen = lazy(() => import('@/screens/buyer/MyOrdersScreen'));
// Admin screens (F4): each lazily loaded, so farmers and buyers never download them.
const AdminDashboardScreen = lazy(() => import('@/screens/admin/AdminDashboardScreen'));
const UsersScreen = lazy(() => import('@/screens/admin/UsersScreen'));
const InvitesScreen = lazy(() => import('@/screens/admin/InvitesScreen'));
const AdminListingsScreen = lazy(() => import('@/screens/admin/AdminListingsScreen'));
const AdminOrdersScreen = lazy(() => import('@/screens/admin/AdminOrdersScreen'));
const AdminOrderDetailScreen = lazy(() => import('@/screens/admin/AdminOrderDetailScreen'));
const PaymentsScreen = lazy(() => import('@/screens/admin/PaymentsScreen'));
const ForecastAccuracyScreen = lazy(() => import('@/screens/admin/ForecastAccuracyScreen'));

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

/** @param {{ roles: string[] }} props */
function RoleLayout({ roles }) {
  return (
    <RequireAuth>
      <RequireRole roles={roles}>
        <AppShell>
          <RouteErrorBoundary>
            <Suspense fallback={<PageLoadingState />}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </AppShell>
      </RequireRole>
    </RequireAuth>
  );
}

/**
 * A lazily loaded account screen, with a loading placeholder in the account layout's colours.
 * @param {import('react').ReactNode} element
 */
function lazyAuth(element) {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center bg-canvas px-4 py-8 outline-none"
        >
          <LoadingState label="Loading page…" rows={2} />
        </main>
      }
    >
      {element}
    </Suspense>
  );
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
          // The code steps redirect to their start screen when their in memory flow is missing.
          { path: '/login/code', element: lazyAuth(<LoginCodeScreen />) },
          { path: '/register', element: lazyAuth(<RegisterScreen />) },
          { path: '/register/verify', element: lazyAuth(<RegisterVerifyScreen />) },
          { path: '/forgot-password', element: lazyAuth(<ForgotPasswordScreen />) },
          // Redirects to /login (flow_lost) when the in memory Google flow is missing.
          { path: '/google/role', element: lazyAuth(<GoogleRoleScreen />) },
        ],
      },
      // Reachable with or without a session: they show SignedInNotice when signed in.
      { path: '/reset-password', element: lazyAuth(<ResetPasswordScreen />) },
      { path: '/accept-invite', element: lazyAuth(<AcceptInviteScreen />) },
      {
        path: '/change-password',
        element: (
          <RequireAuth>
            <ChangePasswordScreen />
          </RequireAuth>
        ),
      },
      {
        // Farmers and buyers only; administrators see the Forbidden screen.
        path: '/account',
        element: <RoleLayout roles={[ROLES.FARMER, ROLES.BUYER]} />,
        children: [
          { index: true, element: <Navigate to="/account/security" replace /> },
          { path: 'security', element: <AccountSecurityScreen /> },
          { path: 'password', element: <SetPasswordScreen /> },
          { path: '*', element: <NotFoundScreen embedded /> },
        ],
      },
      {
        path: '/farmer',
        element: <RoleLayout roles={[ROLES.FARMER]} />,
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
        element: <RoleLayout roles={[ROLES.BUYER]} />,
        children: [
          // The buyer home (ROLE_HOME) opens the browse screen.
          { index: true, element: <Navigate to="/buyer/browse" replace /> },
          { path: 'browse', element: <BrowseScreen /> },
          { path: 'listings/:listingId', element: <ListingDetailScreen /> },
          { path: 'orders', element: <MyOrdersScreen /> },
          { path: 'orders/:orderId', element: <OrderScreen /> },
          { path: '*', element: <NotFoundScreen embedded /> },
        ],
      },
      {
        path: '/admin',
        element: <RoleLayout roles={[ROLES.ADMIN]} />,
        children: [
          { index: true, element: <AdminDashboardScreen /> },
          { path: 'users', element: <UsersScreen /> },
          // The main administrator only; the server checks every invite request too.
          {
            path: 'invites',
            element: (
              <RequireSuperAdmin>
                <InvitesScreen />
              </RequireSuperAdmin>
            ),
          },
          { path: 'listings', element: <AdminListingsScreen /> },
          { path: 'orders', element: <AdminOrdersScreen /> },
          { path: 'orders/:orderId', element: <AdminOrderDetailScreen /> },
          { path: 'payments', element: <PaymentsScreen /> },
          { path: 'forecast-accuracy', element: <ForecastAccuracyScreen /> },
          { path: '*', element: <NotFoundScreen embedded /> },
        ],
      },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
];
