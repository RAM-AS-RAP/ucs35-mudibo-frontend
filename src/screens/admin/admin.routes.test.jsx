// Roles and routing of the administrator area (F4).
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { loginAs, logout, renderApp } from '@/test/render';
import { renderAdmin } from '@/test/admin';
import { recordAll } from '@/test/buyer';
import { queryClient } from '@/lib/queryClient';
import { server } from '@/test/msw/server';
import { http } from 'msw';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { getSession } from '@/auth/session';

afterEach(() => {
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
});

const ADMIN_PATHS = [
  '/admin',
  '/admin/users',
  '/admin/invites',
  '/admin/listings',
  '/admin/orders',
  '/admin/orders/d0000000-0000-4000-8000-000000000001',
  '/admin/payments',
  '/admin/forecast-accuracy',
];

const HEADINGS = {
  '/admin': 'Dashboard',
  '/admin/users': 'Users',
  '/admin/invites': 'Invites',
  '/admin/listings': 'Listings',
  '/admin/orders': 'Orders',
  '/admin/orders/d0000000-0000-4000-8000-000000000001': 'Order AGR-R3V13W',
  '/admin/payments': 'Payments',
  '/admin/forecast-accuracy': 'Forecast accuracy',
};

function mainNavLabels() {
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.firstElementChild?.nextElementSibling?.textContent);
}

describe('admin routes', () => {
  it.each(['farmer', 'buyer'])('a %s cannot open any /admin route', async (role) => {
    for (const path of ADMIN_PATHS) {
      loginAs(role);
      const recorder = recordAll();
      const { unmount } = renderApp(path);
      expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
      expect(recorder.requests.filter((r) => r.path.startsWith('/api/v1/admin'))).toEqual([]);
      recorder.stop();
      unmount();
      logout();
    }
  });

  it('sends anonymous visitors to the login screen', async () => {
    const { router } = renderApp('/admin/users');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it.each(ADMIN_PATHS)('the main administrator opens %s', async (path) => {
    renderAdmin(path);
    expect(
      await screen.findByRole(
        'heading',
        { name: HEADINGS[/** @type {keyof typeof HEADINGS} */ (path)], level: 1 },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
  });

  it('/admin shows the dashboard', async () => {
    renderAdmin('/admin');
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Needs attention' })).toBeInTheDocument();
  });

  it('an ordinary administrator sees no Invites item and gets Forbidden on /admin/invites', async () => {
    const recorder = recordAll();
    renderAdmin('/admin/invites', { superAdmin: false });
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
    expect(mainNavLabels()).not.toContain('Invites');
    expect(recorder.of('GET', '/api/v1/admin/invites')).toEqual([]);
    recorder.stop();
  });

  it('the main administrator sees the Invites item and the invites screen', async () => {
    renderAdmin('/admin/invites');
    expect(await screen.findByRole('heading', { name: 'Invites', level: 1 })).toBeInTheDocument();
    expect(mainNavLabels()).toEqual([
      'Dashboard',
      'Users',
      'Invites',
      'Listings',
      'Orders',
      'Payments',
      'Forecast accuracy',
    ]);
  });

  it('a 401 from an admin route ends the session and goes to the login screen', async () => {
    server.use(
      http.get(apiUrl('/api/v1/admin/stats'), () => errorResponse(401, 'invalid_credentials')),
    );
    const { router } = renderAdmin('/admin');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(getSession()).toBeNull();
  });

  it('shows Not found for an unknown admin path inside the shell', async () => {
    renderAdmin('/admin/nothing-here');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
