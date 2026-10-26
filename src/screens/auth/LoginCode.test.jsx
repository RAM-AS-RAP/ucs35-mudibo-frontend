// Sign in with a code (identity v2): /login answers `code_required`, /login/code completes it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, tokenFor } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout, renderApp } from '@/test/render';
import { getFlow, getFlowView } from '@/auth/flow';
import { getSession } from '@/auth/session';
import { queryClient } from '@/lib/queryClient';

const PASSWORD = 'Mavuno#2026-secret';
const CODE = 'ABCD-2345';
const CHALLENGE = fixtures.authCodeRequired.challenge_token;
const SECRETS = [PASSWORD, CHALLENGE, 'ABCD2345', CODE];
const FAKE = /** @type {const} */ ([
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'Date',
  'performance',
]);

/** @type {import('vitest').MockInstance[]} */
let consoleSpies = [];
beforeEach(() => {
  consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m));
});
afterEach(() => {
  for (const spy of consoleSpies) {
    const output = JSON.stringify(spy.mock.calls);
    for (const secret of SECRETS) expect(output).not.toContain(secret);
    spy.mockRestore();
  }
  vi.useRealTimers();
  logout();
});

/**
 * The backend: login answers code_required (with overrides), verify signs in as the role.
 * @param {{ role?: string, mustChangePassword?: boolean, challenge?: Record<string, unknown> }} [options]
 */
function backend({ role = 'farmer', mustChangePassword = false, challenge = {} } = {}) {
  const seen = { login: 0, verify: /** @type {any[]} */ ([]), me: 0, resend: 0 };
  server.use(
    http.post(apiUrl('/api/v1/auth/login'), () => {
      seen.login += 1;
      return HttpResponse.json({ ...fixtures.authCodeRequired, ...challenge });
    }),
    http.post(apiUrl('/api/v1/auth/login/verify'), async ({ request }) => {
      seen.verify.push(await request.json());
      return HttpResponse.json(tokenFor({ role, mustChangePassword }));
    }),
    http.get(apiUrl('/api/v1/auth/me'), () => {
      seen.me += 1;
      return HttpResponse.json({
        ...fixtures.userMe,
        role,
        must_change_password: mustChangePassword,
      });
    }),
  );
  return seen;
}

/** @param {ReturnType<typeof userEvent.setup>} user */
async function enterPassword(user, email = 'wanjiku@example.com') {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

/** @param {ReturnType<typeof userEvent.setup>} user */
async function enterCode(user, code = CODE) {
  await user.type(await screen.findByLabelText('Code'), code);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

/** Everything a secret must never reach. */
function exposedPlaces(router) {
  return JSON.stringify({
    session: { ...window.sessionStorage },
    local: { ...window.localStorage },
    url: window.location.href,
    routerUrl: `${router.state.location.pathname}${router.state.location.search}${router.state.location.hash}`,
    routerState: router.state.location.state,
    history: window.history.state,
    queries: queryClient
      .getQueryCache()
      .getAll()
      .map((q) => [q.queryKey, q.state.data]),
    mutations: queryClient
      .getMutationCache()
      .getAll()
      .map((m) => m.state),
  });
}

describe('sign in with a code', () => {
  it.each([
    ['farmer', '/farmer'],
    ['buyer', '/buyer/browse'],
    ['admin', '/admin'],
  ])('a %s enters the code and opens %s', async (role, home) => {
    const seen = backend({ role });
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await enterPassword(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/code'));
    expect(getSession()).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toHaveFocus();
    expect(
      screen.getByText('We sent an 8 character code to w***@e***.com. It is valid for 10 minutes.'),
    ).toBeInTheDocument();
    await enterCode(user, 'abcd 2345');
    await waitFor(() => expect(router.state.location.pathname).toBe(home));
    expect(seen.verify).toEqual([{ challenge_token: CHALLENGE, code: 'ABCD2345' }]);
    expect(seen.me).toBe(1);
    expect(getSession()).toMatchObject({ role, name: 'Wanjiku Kamau' });
    expect(getFlow('login')).toBeNull();
  });

  it('carries only {from} to the code screen and honours the intended path (sign in hold)', async () => {
    backend();
    const user = userEvent.setup();
    const { router } = renderApp('/farmer/forecast');
    await enterPassword(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/code'));
    expect(router.state.location.state).toEqual({ from: '/farmer/forecast' });
    await enterCode(user);
    // Without the hold PublicOnly would open /farmer first.
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer/forecast'));
  });

  it('opens /change-password for an account that must change its password', async () => {
    backend({ role: 'buyer', mustChangePassword: true });
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await enterPassword(user);
    await enterCode(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
  });

  it('says when the email could not be sent', async () => {
    backend({ challenge: { code_sent: false } });
    const user = userEvent.setup();
    renderApp('/login');
    await enterPassword(user);
    expect(
      await screen.findByText('We could not send the email. Press Send a new code.'),
    ).toBeInTheDocument();
  });

  it('does not keep the password after the request, also when it fails', async () => {
    server.use(http.post(apiUrl('/api/v1/auth/login'), () => errorResponse(429, 'rate_limited')));
    const user = userEvent.setup();
    renderApp('/login');
    await enterPassword(user);
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Email')).toHaveValue('wanjiku@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('a wrong code shows the field message, clears the field and keeps focus on it', async () => {
    backend();
    server.use(
      http.post(apiUrl('/api/v1/auth/login/verify'), () =>
        errorResponse(400, 'invalid_or_expired_code'),
      ),
    );
    const user = userEvent.setup();
    renderApp('/login');
    await enterPassword(user);
    await enterCode(user);
    expect(await screen.findByText('That code is incorrect or has expired.')).toBeInTheDocument();
    const field = screen.getByLabelText('Code');
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: /Send a new code/ })).toBeInTheDocument();
    expect(getFlow('login')).not.toBeNull();
  });

  it('challenge_closed clears the flow and returns to /login with the message', async () => {
    backend();
    server.use(
      http.post(apiUrl('/api/v1/auth/login/verify'), () => errorResponse(400, 'challenge_closed')),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await enterPassword(user);
    await enterCode(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(
      await screen.findByText('Your sign in session ended. Please sign in again.'),
    ).toBeInTheDocument();
    expect(getFlow('login')).toBeNull();
  });

  it('a reload (an empty flow) sends /login/code back to /login with flow_lost', async () => {
    const { router } = renderApp('/login/code');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(
      await screen.findByText('Your sign in was interrupted. Please start again.'),
    ).toBeInTheDocument();
  });

  it('"Start again" clears the flow and goes to /login', async () => {
    backend();
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await enterPassword(user);
    await user.click(await screen.findByRole('link', { name: 'Start again' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(getFlow('login')).toBeNull();
    expect(screen.queryByText(/Enter the code we emailed/)).not.toBeInTheDocument();
  });

  it('shows the existing flow on /login with a Continue link, so Back does not send a new email', async () => {
    const seen = backend();
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await enterPassword(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/code'));
    await act(() => router.navigate(-1));
    expect(
      await screen.findByText('Enter the code we emailed to w***@e***.com'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Continue' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/code'));
    expect(seen.login).toBe(1);
  });

  it('a double submit of the code sends one request', async () => {
    backend();
    /** @type {() => void} */
    let finish = () => {};
    let calls = 0;
    server.use(
      http.post(apiUrl('/api/v1/auth/login/verify'), async () => {
        calls += 1;
        await new Promise((resolve) => {
          finish = () => resolve(undefined);
        });
        return HttpResponse.json(fixtures.tokenResponse);
      }),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await enterPassword(user);
    await enterCode(user);
    const pending = await screen.findByRole('button', { name: 'Checking…' });
    expect(pending).toBeDisabled();
    await user.click(pending);
    await user.keyboard('{Enter}');
    finish();
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
    expect(calls).toBe(1);
  });

  it('never submits a pasted code by itself', async () => {
    const seen = backend();
    const user = userEvent.setup();
    renderApp('/login');
    await enterPassword(user);
    await user.click(await screen.findByLabelText('Code'));
    await user.paste(CODE);
    expect(screen.getByLabelText('Code')).toHaveValue(CODE);
    expect(seen.verify).toEqual([]);
  });

  it('keeps the password, the code and the challenge token out of every store, the URL and logs', async () => {
    backend();
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await enterPassword(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/code'));
    // Before sign in completes there is no session entry at all.
    expect(window.sessionStorage.getItem('agrisence.session')).toBeNull();
    for (const secret of SECRETS) expect(exposedPlaces(router)).not.toContain(secret);
    await enterCode(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
    expect(Object.keys(window.sessionStorage)).toEqual(['agrisence.session']);
    for (const secret of SECRETS) expect(exposedPlaces(router)).not.toContain(secret);
  });
});

describe('resending the sign in code', () => {
  it('restarts the countdown from the server and announces the new code once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: [...FAKE] });
    backend({ challenge: { resend_available_in: 0 } });
    let resends = 0;
    server.use(
      http.post(apiUrl('/api/v1/auth/login/resend'), () => {
        resends += 1;
        return HttpResponse.json({ ...fixtures.loginResent, resend_available_in: 45 });
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/login');
    await enterPassword(user);
    await user.click(await screen.findByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByText('A new code was sent.')).toBeInTheDocument();
    expect(screen.getAllByText('A new code was sent.')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Send a new code in 45 s' })).toBeDisabled();
    // The countdown text is not in a live region: nothing announces each second.
    const statuses = () =>
      screen
        .getAllByRole('status')
        .map((el) => el.textContent)
        .join('|');
    const before = statuses();
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByRole('button', { name: 'Send a new code in 40 s' })).toBeDisabled();
    expect(statuses()).toBe(before);
    await act(() => vi.advanceTimersByTimeAsync(41_000));
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled();
    expect(screen.getByText('You can send a new code now.')).toBeInTheDocument();
    expect(resends).toBe(1);
  });

  it('says when the new email could not be sent', async () => {
    backend({ challenge: { resend_available_in: 0 } });
    server.use(
      http.post(apiUrl('/api/v1/auth/login/resend'), () =>
        HttpResponse.json({ ...fixtures.loginResent, code_sent: false }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/login');
    await enterPassword(user);
    await user.click(await screen.findByRole('button', { name: 'Send a new code' }));
    expect(
      await screen.findByText('We could not send the email. Try again shortly.'),
    ).toBeInTheDocument();
  });

  it('429 resend_cooldown restarts the countdown from Retry-After', async () => {
    backend({ challenge: { resend_available_in: 0 } });
    server.use(
      http.post(apiUrl('/api/v1/auth/login/resend'), () =>
        errorResponse(429, 'resend_cooldown', { headers: { 'Retry-After': '37' } }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/login');
    await enterPassword(user);
    await user.click(await screen.findByRole('button', { name: 'Send a new code' }));
    expect(
      await screen.findByText('Please wait before asking for another code.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send a new code in 3[67] s/ })).toBeDisabled();
  });

  it('409 send_limit_reached hides the resend control and leaves "Start again"', async () => {
    backend({ challenge: { resend_available_in: 0 } });
    server.use(
      http.post(apiUrl('/api/v1/auth/login/resend'), () =>
        errorResponse(409, 'send_limit_reached'),
      ),
    );
    const user = userEvent.setup();
    renderApp('/login');
    await enterPassword(user);
    await user.click(await screen.findByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have used all the code resends. Please start again.',
    );
    expect(screen.queryByRole('button', { name: /Send a new code/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start again' })).toBeInTheDocument();
  });

  it('challenge_closed on resend returns to /login', async () => {
    backend({ challenge: { resend_available_in: 0 } });
    server.use(
      http.post(apiUrl('/api/v1/auth/login/resend'), () => errorResponse(400, 'challenge_closed')),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await enterPassword(user);
    await user.click(await screen.findByRole('button', { name: 'Send a new code' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(getFlowView('login')).toBeNull();
  });
});

describe('too_many_login_codes', () => {
  it('counts down 30 seconds on the button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: [...FAKE] });
    server.use(
      http.post(apiUrl('/api/v1/auth/login'), () =>
        errorResponse(429, 'too_many_login_codes', { headers: { 'Retry-After': '30' } }),
      ),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/login');
    await enterPassword(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many sign in codes were requested. Try again in 30 seconds.',
    );
    expect(screen.getByRole('button', { name: 'Try again in 30 s' })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(31_000));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it.each([
    ['600', 'about 10 minutes'],
    ['7200', 'about 2 hours'],
  ])('shows %s seconds approximately and re-enables by timestamp', async (header, words) => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: [...FAKE] });
    server.use(
      http.post(apiUrl('/api/v1/auth/login'), () =>
        errorResponse(429, 'too_many_login_codes', { headers: { 'Retry-After': header } }),
      ),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/login');
    await enterPassword(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      `Too many sign in codes were requested. Try again in ${words}.`,
    );
    const button = within(screen.getByRole('main')).getByRole('button', { name: 'Sign in' });
    expect(button).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync((Number(header) - 30) * 1000));
    expect(button).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(50_000));
    expect(button).toBeEnabled();
  });
});
