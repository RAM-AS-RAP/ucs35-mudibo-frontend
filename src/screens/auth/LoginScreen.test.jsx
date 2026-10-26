import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, tokenFor } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout, renderApp } from '@/test/render';
import { getSession } from '@/auth/session';
import { queryClient } from '@/lib/queryClient';

const PASSWORD = 'Mavuno#2026-secret';

/** @type {import('vitest').MockInstance[]} */
let consoleSpies = [];
beforeEach(() => {
  consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m));
});
afterEach(() => {
  for (const spy of consoleSpies) {
    expect(JSON.stringify(spy.mock.calls)).not.toContain(PASSWORD);
    spy.mockRestore();
  }
  vi.useRealTimers();
  logout();
});

/**
 * @param {ReturnType<typeof userEvent.setup>} user
 * @param {{ email?: string, password?: string }} [values]
 */
async function signIn(user, { email = 'wanjiku@example.com', password = PASSWORD } = {}) {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

/** @param {string} role @param {{ mustChangePassword?: boolean, name?: string }} [options] */
function backendFor(role, { mustChangePassword = false, name = 'Wanjiku Kamau' } = {}) {
  server.use(
    http.post(apiUrl('/api/v1/auth/login'), () =>
      HttpResponse.json(tokenFor({ role, mustChangePassword })),
    ),
    http.get(apiUrl('/api/v1/auth/me'), () =>
      HttpResponse.json({
        ...fixtures.userMe,
        role,
        name,
        must_change_password: mustChangePassword,
      }),
    ),
  );
}

describe('LoginScreen (signed_in without a code)', () => {
  it.each([
    ['farmer', '/farmer'],
    // The buyer home /buyer redirects to the browse screen (F3).
    ['buyer', '/buyer/browse'],
    ['admin', '/admin'],
  ])('signs a %s in and opens %s with the name from /auth/me', async (role, home) => {
    backendFor(role);
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await signIn(user);
    await waitFor(() => expect(router.state.location.pathname).toBe(home));
    // The account menu of every role shows the name (the buyer home no longer has a welcome line).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /account menu/i })).toHaveTextContent(
        'Wanjiku Kamau',
      ),
    );
    if (role !== 'buyer') {
      expect(await screen.findByText('Welcome, Wanjiku Kamau')).toBeInTheDocument();
    }
    expect(getSession()).toMatchObject({ role, name: 'Wanjiku Kamau' });
  });

  it('opens /change-password when the account must change its password', async () => {
    backendFor('buyer', { mustChangePassword: true });
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await signIn(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
    expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
  });

  it('returns to the remembered path inside the role tree and says why sign in was needed', async () => {
    backendFor('farmer');
    const user = userEvent.setup();
    const { router } = renderApp('/farmer/forecast');
    expect(await screen.findByText('Please sign in to continue.')).toBeInTheDocument();
    await signIn(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer/forecast'));
  });

  it('keeps the session with a generic greeting when /auth/me fails', async () => {
    server.use(http.get(apiUrl('/api/v1/auth/me'), () => errorResponse(500, 'internal_error')));
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await signIn(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
    expect(await screen.findByText('Welcome')).toBeInTheDocument();
    expect(getSession()?.accessToken).toBe(fixtures.tokenResponse.access_token);
  });

  it('shows the exact message on 401 and clears only the password', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/login'), () =>
        errorResponse(401, 'invalid_credentials', { requestId: 'req-401' }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/login');
    await signIn(user, { email: 'wanjiku@example.com' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Incorrect email or password.');
    expect(alert).not.toHaveTextContent('Reference');
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveValue('wanjiku@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(getSession()).toBeNull();
  });

  it('counts down from Retry-After on 429 and disables the button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(
      http.post(apiUrl('/api/v1/auth/login'), () =>
        errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '42' } }),
      ),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/login');
    await signIn(user);
    expect(
      await screen.findByText('Too many attempts. Try again in 42 seconds.'),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Try again in 42 s' });
    expect(button).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByRole('button', { name: 'Try again in 40 s' })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(40_000));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('falls back to 60 seconds without Retry-After', async () => {
    server.use(http.post(apiUrl('/api/v1/auth/login'), () => errorResponse(429, 'rate_limited')));
    const user = userEvent.setup();
    renderApp('/login');
    await signIn(user);
    expect(
      await screen.findByText('Too many attempts. Try again in 60 seconds.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again in 60 s' })).toBeDisabled();
  });

  it('says to check the connection on a network failure', async () => {
    server.use(http.post(apiUrl('/api/v1/auth/login'), () => HttpResponse.error()));
    const user = userEvent.setup();
    renderApp('/login');
    await signIn(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't reach AgriSence. Check your internet connection and try again.",
    );
  });

  it('says to check the connection on a timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(
      http.post(apiUrl('/api/v1/auth/login'), async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/login');
    await signIn(user);
    await act(() => vi.advanceTimersByTimeAsync(20_500));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The request took too long. Check your connection and try again.',
    );
  });

  it('prevents a double submit while the request is pending', async () => {
    let calls = 0;
    /** @type {() => void} */
    let finish = () => {};
    server.use(
      http.post(apiUrl('/api/v1/auth/login'), async () => {
        calls += 1;
        await new Promise((resolve) => {
          finish = () => resolve(undefined);
        });
        return HttpResponse.json(fixtures.tokenResponse);
      }),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await signIn(user);
    const pending = await screen.findByRole('button', { name: 'Signing in…' });
    expect(pending).toBeDisabled();
    await user.click(pending);
    await user.keyboard('{Enter}');
    expect(calls).toBe(1);
    finish();
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
    expect(calls).toBe(1);
  });

  it('keeps the password out of storage and query keys; only the session key is written', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await signIn(user, { email: 'wanjiku@example.com' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
    expect(Object.keys(window.sessionStorage)).toEqual(['agrisence.session']);
    expect(window.sessionStorage.getItem('agrisence.session')).not.toContain(PASSWORD);
    expect(window.sessionStorage.getItem('agrisence.session')).not.toContain('wanjiku@example');
    expect(window.localStorage.length).toBe(0);
    const keys = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey),
    );
    expect(keys).not.toContain(PASSWORD);
    expect(keys).not.toContain(fixtures.tokenResponse.access_token);
    expect(
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state),
      ),
    ).not.toContain(PASSWORD);
    expect(router.state.location.state ?? {}).not.toHaveProperty('password');
  });

  it('shows the client errors and focuses the first invalid field', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables submission while offline', async () => {
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    renderApp('/login');
    expect(
      await screen.findByText('You are offline. Connect to the internet to continue.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    onLine.mockRestore();
  });
});
