import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { loginAs, logout, renderApp } from '@/test/render';
import { fixtures } from '@/test/fixtures';
import { api, unwrap } from '@/api/client';

afterEach(() => logout());

describe('guards and routes', () => {
  it('redirects / to the public home (login)', async () => {
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('sends an anonymous user to /login and remembers the intended path in router state', async () => {
    const { router } = renderApp('/farmer/forecast');
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('');
    expect(router.state.location.state).toEqual({ from: '/farmer/forecast' });
  });

  it('shows Forbidden to the wrong role, without redirecting', async () => {
    loginAs('buyer');
    const { router } = renderApp('/farmer');
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/farmer');
  });

  it('restricts a session that must change its password to /change-password', async () => {
    loginAs('farmer', { mustChangePassword: true });
    const { router } = renderApp('/farmer');
    expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/change-password');

    await router.navigate('/login');
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
    await router.navigate('/admin');
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
  });

  it('lets /reset-password and /accept-invite open with a session (they show a notice)', async () => {
    loginAs('buyer');
    const { router } = renderApp('/reset-password');
    expect(
      await screen.findByRole('heading', { name: 'Reset your password', level: 1 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/reset-password');
    await router.navigate('/accept-invite');
    expect(
      await screen.findByRole('heading', { name: 'Accept your invitation', level: 1 }),
    ).toBeInTheDocument();
  });

  it('keeps /register and /forgot-password public only', async () => {
    loginAs('farmer');
    const { router } = renderApp('/register');
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
    await router.navigate('/forgot-password');
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
  });

  it('sends an anonymous visitor of /change-password to /login', async () => {
    const { router } = renderApp('/change-password');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('sets the page title', async () => {
    renderApp('/register');
    await screen.findByRole('heading', { name: 'Create an account', level: 1 });
    expect(document.title).toBe('Create an account - AgriSence');
  });

  it('sends an authenticated user from /login to their role home', async () => {
    loginAs('admin');
    const { router } = renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin');
  });

  it('renders a farmer section inside the shell', async () => {
    loginAs('farmer');
    renderApp('/farmer/listings');
    expect(
      await screen.findByRole('heading', { name: 'My listings', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
  });

  it('shows NotFound for an unknown route', async () => {
    renderApp('/no/such/page');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows NotFound inside the shell for an unknown section of a role area', async () => {
    loginAs('buyer');
    renderApp('/buyer/nowhere');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
  });

  it.each(['/farmer', '/farmer/prices', '/farmer/forecast'])(
    'a buyer cannot open %s (Forbidden, no price request)',
    async (path) => {
      loginAs('buyer');
      const seen = [];
      server.events.on('request:start', ({ request }) => seen.push(request.url));
      renderApp(path);
      expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
      expect(seen.filter((url) => /prices|markets|forecasts/.test(url))).toEqual([]);
      server.events.removeAllListeners();
    },
  );

  it.each(['/farmer/prices', '/farmer/forecast?market=Nairobi'])(
    'sends an anonymous visitor of %s to /login',
    async (path) => {
      const { router } = renderApp(path);
      await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    },
  );

  it('names the farmer home "Dashboard" and opens My listings, Orders and New listing', async () => {
    loginAs('farmer');
    const { router } = renderApp('/farmer');
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'My listings' })).toHaveAttribute(
      'href',
      '/farmer/listings',
    );
    expect(within(nav).getByRole('link', { name: 'Orders' })).toHaveAttribute(
      'href',
      '/farmer/orders',
    );
    for (const [path, title] of [
      ['/farmer/listings', 'My listings'],
      ['/farmer/orders', 'Orders'],
      ['/farmer/listings/new?crop=maize&market=Nairobi', 'New listing'],
      [`/farmer/listings/${fixtures.myListingsPage.items[0].id}/edit`, 'Edit listing'],
    ]) {
      await router.navigate(path);
      expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
      expect(screen.queryByText(/This screen is built in module/)).not.toBeInTheDocument();
    }
  });

  it('shows NotFound inside the farmer shell for an unknown farmer section', async () => {
    loginAs('farmer');
    renderApp('/farmer/nowhere');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
  });

  it.each([
    '/farmer/listings',
    '/farmer/listings/new',
    `/farmer/listings/${fixtures.myListingsPage.items[0].id}/edit`,
    '/farmer/orders',
  ])('a buyer cannot open %s and no listing or order request is sent', async (path) => {
    loginAs('buyer');
    const seen = [];
    server.events.on('request:start', ({ request }) => seen.push(request.url));
    renderApp(path);
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
    expect(seen.filter((url) => /listings|orders/.test(url))).toEqual([]);
    server.events.removeAllListeners();
  });

  it.each(['/farmer/listings', '/farmer/listings/new', '/farmer/orders?status=paid'])(
    'sends an anonymous visitor of %s to /login',
    async (path) => {
      const { router } = renderApp(path);
      await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    },
  );

  it('a 401 from the API logs out and navigates to /login through the router', async () => {
    loginAs('farmer');
    const { router } = renderApp('/farmer');
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });
    server.use(
      http.get(apiUrl('/api/v1/auth/me'), () => errorResponse(401, 'invalid_credentials')),
    );
    await unwrap(api.GET('/api/v1/auth/me')).catch(() => {});
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(
      await screen.findByText('Your session expired. Please sign in again.'),
    ).toBeInTheDocument();
  });
});
