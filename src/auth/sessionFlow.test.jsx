import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout, renderApp, restoreStoredSession } from '@/test/render';
import { OfflineBanner, UNREACHABLE_MESSAGE } from '@/components/feedback/OfflineBanner';
import { queryClient } from '@/lib/queryClient';
import { consumeFlash, getSession, setFromLogin, setProfile } from './session';
import { useAuth } from './useAuth';

afterEach(() => {
  vi.useRealTimers();
  logout();
});

describe('startup revalidation', () => {
  it('checks a restored session with /auth/me before rendering, and refreshes the profile', async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl('/api/v1/auth/me'), async () => {
        calls += 1;
        await delay(50);
        return HttpResponse.json({ ...fixtures.userMe, name: 'Fresh Name' });
      }),
    );
    restoreStoredSession({ role: 'farmer', name: 'Stored Name' });
    renderApp('/farmer');
    expect(await screen.findByText('Checking your session…')).toBeInTheDocument();
    expect(await screen.findByText('Welcome, Fresh Name')).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('updates role and must_change_password from the response', async () => {
    server.use(
      http.get(apiUrl('/api/v1/auth/me'), () =>
        HttpResponse.json({ ...fixtures.userMe, role: 'farmer', must_change_password: true }),
      ),
    );
    restoreStoredSession({ role: 'farmer' });
    const { router } = renderApp('/farmer');
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
    expect(getSession()?.mustChangePassword).toBe(true);
  });

  it('a 401 clears the session with the expired flash', async () => {
    server.use(
      http.get(apiUrl('/api/v1/auth/me'), () => errorResponse(401, 'invalid_credentials')),
    );
    restoreStoredSession({ role: 'buyer' });
    const { router } = renderApp('/buyer');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(
      await screen.findByText('Your session expired. Please sign in again.'),
    ).toBeInTheDocument();
    expect(getSession()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('a network failure keeps the session and shows the offline banner', async () => {
    server.use(http.get(apiUrl('/api/v1/auth/me'), () => HttpResponse.error()));
    restoreStoredSession({ role: 'farmer', name: 'Stored Name' });
    render(<OfflineBanner />);
    renderApp('/farmer');
    expect(await screen.findByText('Welcome, Stored Name')).toBeInTheDocument();
    expect(screen.getByText(UNREACHABLE_MESSAGE)).toBeInTheDocument();
    expect(getSession()).not.toBeNull();
  });

  it('gives up waiting after 8 seconds and renders with the stored session', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(
      http.get(apiUrl('/api/v1/auth/me'), async () => {
        await delay('infinite');
        return HttpResponse.json(fixtures.userMe);
      }),
    );
    restoreStoredSession({ role: 'farmer', name: 'Stored Name' });
    renderApp('/farmer');
    expect(await screen.findByText('Checking your session…')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(7_000));
    expect(screen.getByText('Checking your session…')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1_100));
    expect(await screen.findByText('Welcome, Stored Name')).toBeInTheDocument();
  });

  it('does not revalidate a session created by a login in this page', async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl('/api/v1/auth/me'), () => {
        calls += 1;
        return HttpResponse.json(fixtures.userMe);
      }),
    );
    setFromLogin(fixtures.tokenResponse);
    renderApp('/farmer');
    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeInTheDocument();
    expect(calls).toBe(0);
  });
});

describe('expiry and logout', () => {
  it('automatic expiry shows the flash on the login screen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setFromLogin({ ...fixtures.tokenResponse, expires_in: 5 });
    const { router } = renderApp('/farmer');
    await screen.findByRole('heading', { name: 'Overview', level: 1 });
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(
      await screen.findByText('Your session expired. Please sign in again.'),
    ).toBeInTheDocument();
  });

  it('sign out from the account menu clears everything and shows no flash', async () => {
    setFromLogin(fixtures.tokenResponse);
    setProfile(fixtures.userMe);
    queryClient.setQueryData(['listings', 'mine'], [{ id: 1 }]);
    const user = userEvent.setup();
    const { router } = renderApp('/farmer');
    await user.click(await screen.findByRole('button', { name: /account menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(getSession()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
    // Only the login screen's public health checks may be cached again.
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => query.queryKey[0] !== 'system'),
    ).toHaveLength(0);
    expect(screen.queryByText(/Please sign in/)).not.toBeInTheDocument();
    // The sign out's silent flash was consumed by the login screen.
    expect(consumeFlash()).toBeNull();
  });

  it('the account menu shows the name, the role and a change password link', async () => {
    setFromLogin(fixtures.tokenResponse);
    setProfile(fixtures.userMe);
    const user = userEvent.setup();
    const { router } = renderApp('/farmer');
    await user.click(await screen.findByRole('button', { name: /account menu/i }));
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent('Wanjiku Kamau');
    expect(menu).toHaveTextContent('Farmer');
    expect(within(menu).queryByText('Super admin')).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Change password' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
  });
});

describe('isSuperAdmin', () => {
  /** @type {ReturnType<typeof useAuth> | null} */
  let auth = null;
  function Probe() {
    auth = useAuth();
    return null;
  }

  it('is false when /auth/me has no is_super_admin', () => {
    setFromLogin({ ...fixtures.tokenResponse, role: 'admin' });
    setProfile(fixtures.adminMe);
    expect(getSession()?.isSuperAdmin).toBe(false);
  });

  it('is read from the profile when present and shown in the account menu', async () => {
    setFromLogin({ ...fixtures.tokenResponse, role: 'admin' });
    setProfile({ ...fixtures.adminMe, is_super_admin: true });
    const user = userEvent.setup();
    renderApp('/admin');
    await user.click(await screen.findByRole('button', { name: /account menu/i }));
    expect(within(await screen.findByRole('menu')).getByText('Super admin')).toBeInTheDocument();
  });

  it('is exposed by useAuth', async () => {
    setFromLogin({ ...fixtures.tokenResponse, role: 'admin' });
    setProfile({ ...fixtures.adminMe, is_super_admin: true });
    const { renderWithProviders } = await import('@/test/render');
    renderWithProviders(<Probe />);
    expect(auth).toMatchObject({
      isAuthenticated: true,
      role: 'admin',
      name: 'Amina Odhiambo',
      isSuperAdmin: true,
      mustChangePassword: false,
    });
  });
});
