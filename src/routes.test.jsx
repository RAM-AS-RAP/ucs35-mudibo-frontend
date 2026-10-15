import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { loginAs, logout, renderApp } from '@/test/render';
import { api, unwrap } from '@/api/client';

afterEach(() => logout());

describe('guards and routes', () => {
  it('redirects / to the public home (login)', async () => {
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('sends an anonymous user to /login and remembers the intended path in router state', async () => {
    const { router } = renderApp('/farmer/forecast');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
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
    expect(
      await screen.findByRole('heading', { name: 'Change your password' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/change-password');

    await router.navigate('/login');
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
    await router.navigate('/admin');
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
  });

  it('sends an authenticated user from /login to their role home', async () => {
    loginAs('admin');
    const { router } = renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin');
  });

  it('renders each role home inside its shell', async () => {
    loginAs('farmer');
    renderApp('/farmer/listings');
    expect(
      await screen.findByRole('heading', { name: 'My listings', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('This screen is built in module F2 (farmer).')).toBeInTheDocument();
  });

  it('shows NotFound for an unknown route', async () => {
    renderApp('/no/such/page');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows NotFound inside the shell for an unknown section of a role area', async () => {
    loginAs('buyer');
    renderApp('/buyer/nowhere');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('a 401 from the API logs out and navigates to /login through the router', async () => {
    loginAs('farmer');
    const { router } = renderApp('/farmer');
    await screen.findByRole('heading', { name: 'Overview', level: 1 });
    server.use(
      http.get(apiUrl('/api/v1/auth/me'), () => errorResponse(401, 'invalid_credentials')),
    );
    await unwrap(api.GET('/api/v1/auth/me')).catch(() => {});
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText('Your session ended. Please log in again.')).toBeInTheDocument();
  });
});
