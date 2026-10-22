import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { routes } from '@/routes';
import { clear, consumeFlash, restore, setFromLogin, setProfile } from '@/auth/session';

/**
 * Render the real route table at a path.
 * @param {string} path
 */
export function renderApp(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, ...utils };
}

/**
 * Render any element inside a memory router and the query client.
 * @param {import('react').ReactElement} element
 * @param {{ path?: string }} [options]
 */
export function renderWithProviders(element, { path = '/' } = {}) {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, ...utils };
}

/**
 * Start a real (not a development fake) session for a role. With `userId` the profile from
 * GET /auth/me is merged too, as after a real sign in.
 * @param {string} role
 * @param {{ mustChangePassword?: boolean, token?: string, isSuperAdmin?: boolean, userId?: string, name?: string }} [options]
 */
export function loginAs(
  role,
  {
    mustChangePassword = false,
    token = 'test-token-not-a-secret',
    isSuperAdmin = false,
    userId,
    name = 'Test User',
  } = {},
) {
  setFromLogin({
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    role,
    is_super_admin: isSuperAdmin,
    must_change_password: mustChangePassword,
  });
  if (userId) {
    setProfile({
      id: userId,
      name,
      phone_number: '254700000000',
      email: null,
      role,
      is_super_admin: isSuperAdmin,
      must_change_password: mustChangePassword,
      created_at: '2026-10-01T08:00:00Z',
    });
  }
}

/** End the session between tests, without leaving the sign out's silent flash behind. */
export function logout() {
  clear('logout');
  consumeFlash();
}

/**
 * Put a session in sessionStorage and load it as the app does at startup, so the next
 * protected route revalidates it with GET /auth/me.
 * @param {{ role?: string, mustChangePassword?: boolean, isSuperAdmin?: boolean, name?: string | null }} [options]
 */
export function restoreStoredSession({
  role = 'farmer',
  mustChangePassword = false,
  isSuperAdmin = false,
  name = 'Stored Name',
} = {}) {
  window.sessionStorage.setItem(
    'agrisence.session',
    JSON.stringify({
      accessToken: 'stored-token-not-a-secret',
      role,
      mustChangePassword,
      isSuperAdmin,
      expiresAt: Date.now() + 30 * 60 * 1000,
      name,
    }),
  );
  restore();
}
