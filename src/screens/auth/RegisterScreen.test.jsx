// Registration with a confirmation code (identity v2): /register then /register/verify.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, tokenFor, validationErrorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout, renderApp } from '@/test/render';
import { getFlow } from '@/auth/flow';
import { getSession } from '@/auth/session';
import { queryClient } from '@/lib/queryClient';

const PASSWORD = 'Mavuno#2026';
const CODE = 'WXYZ-6789';
const TOKENS = [
  fixtures.registrationAccepted.registration_token,
  fixtures.registrationAcceptedExisting.registration_token,
];
const SECRETS = [PASSWORD, CODE, 'WXYZ6789', ...TOKENS];

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
 * Record the register and verify requests; the register answer can be swapped (an existing
 * email gets the decoy fixture, with the same shape).
 * @param {{ accepted?: Record<string, unknown> }} [options]
 */
function recordRequests({ accepted = fixtures.registrationAccepted } = {}) {
  const seen = {
    register: /** @type {{ path: string, body: any }[]} */ ([]),
    verify: /** @type {any[]} */ ([]),
    login: 0,
  };
  for (const role of ['farmer', 'buyer']) {
    server.use(
      http.post(apiUrl(`/api/v1/auth/register/${role}`), async ({ request }) => {
        seen.register.push({ path: new URL(request.url).pathname, body: await request.json() });
        return HttpResponse.json(accepted, { status: 202 });
      }),
    );
  }
  const role = () => (seen.register.at(-1)?.path.endsWith('buyer') ? 'buyer' : 'farmer');
  server.use(
    http.post(apiUrl('/api/v1/auth/register/verify'), async ({ request }) => {
      seen.verify.push(await request.json());
      return HttpResponse.json(tokenFor({ role: role() }), { status: 201 });
    }),
    http.post(apiUrl('/api/v1/auth/login'), () => {
      seen.login += 1;
      return HttpResponse.json(fixtures.tokenResponse);
    }),
    http.get(apiUrl('/api/v1/auth/me'), () =>
      HttpResponse.json({ ...fixtures.userMe, role: role() }),
    ),
  );
  return seen;
}

/**
 * @param {ReturnType<typeof userEvent.setup>} user
 * @param {{ role?: 'farmer' | 'buyer' | null, name?: string, email?: string, password?: string, confirm?: string }} [values]
 */
async function fillForm(user, values = {}) {
  const {
    role = 'farmer',
    name = 'Wanjiku Kamau',
    email = 'Wanjiku@Example.com',
    password = PASSWORD,
    confirm = password,
  } = values;
  if (role) await user.click(await screen.findByLabelText(new RegExp(`I am a ${role}`)));
  if (name) await user.type(await screen.findByLabelText('Full name'), name);
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  if (confirm) await user.type(screen.getByLabelText('Confirm password'), confirm);
}

const submit = (/** @type {ReturnType<typeof userEvent.setup>} */ user) =>
  user.click(screen.getByRole('button', { name: 'Create account' }));

/** @param {ReturnType<typeof userEvent.setup>} user */
async function enterCode(user, code = CODE) {
  await user.type(await screen.findByLabelText('Code'), code);
  await user.click(screen.getByRole('button', { name: 'Confirm email' }));
}

describe('RegisterScreen', () => {
  it('has no default role choice and offers both radio cards', async () => {
    renderApp('/register');
    const farmer = await screen.findByRole('radio', { name: /I am a farmer/ });
    const buyer = screen.getByRole('radio', { name: /I am a buyer/ });
    expect(farmer).not.toBeChecked();
    expect(buyer).not.toBeChecked();
  });

  it('preselects the role from ?role= and ignores unknown values', async () => {
    const { unmount } = renderApp('/register?role=buyer');
    expect(await screen.findByRole('radio', { name: /I am a buyer/ })).toBeChecked();
    unmount();
    renderApp('/register?role=admin');
    expect(await screen.findByRole('radio', { name: /I am a farmer/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /I am a buyer/ })).not.toBeChecked();
  });

  it('requires the role choice and sends nothing until it is made', async () => {
    const seen = recordRequests();
    const user = userEvent.setup();
    renderApp('/register');
    await fillForm(user, { role: null });
    await submit(user);
    expect(
      await screen.findByText('Choose whether you are a farmer or a buyer.'),
    ).toBeInTheDocument();
    expect(seen.register).toEqual([]);
  });

  it('has no phone field', async () => {
    renderApp('/register');
    await screen.findByLabelText('Full name');
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
  });

  it.each([
    ['farmer', '/api/v1/auth/register/farmer'],
    ['buyer', '/api/v1/auth/register/buyer'],
  ])('sends exactly {name, email, password} for a %s (never role)', async (role, path) => {
    const seen = recordRequests();
    const user = userEvent.setup();
    const { router } = renderApp('/register');
    await fillForm(user, { role: /** @type {'farmer' | 'buyer'} */ (role) });
    await submit(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/register/verify'));
    expect(seen.register).toEqual([
      {
        path,
        body: { name: 'Wanjiku Kamau', email: 'wanjiku@example.com', password: PASSWORD },
      },
    ]);
    expect(getFlow('register')?.token).toBe(fixtures.registrationAccepted.registration_token);
    expect(router.state.location.state ?? null).toBeNull();
  });

  it('shows the identical confirm screen for a new and an existing email, and never says which', async () => {
    const texts = [];
    for (const accepted of [fixtures.registrationAccepted, fixtures.registrationAcceptedExisting]) {
      recordRequests({ accepted });
      const user = userEvent.setup();
      const { router, unmount } = renderApp('/register');
      await fillForm(user);
      await submit(user);
      await waitFor(() => expect(router.state.location.pathname).toBe('/register/verify'));
      await screen.findByLabelText('Code');
      texts.push(screen.getByRole('main').textContent);
      unmount();
      logout();
    }
    expect(texts[0]).toBe(texts[1]);
    expect(texts[0]).toContain(
      'If this address can be registered, we have sent an 8 character code to w***@e***.com. It is valid for 15 minutes.',
    );
    expect(texts[0]).not.toMatch(/already exists|already registered|no account|not registered/i);
  });

  it('clears the password fields after the request', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/register/farmer'), () => errorResponse(429, 'rate_limited')),
    );
    const user = userEvent.setup();
    renderApp('/register');
    await fillForm(user);
    await submit(user);
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Confirm password')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveValue('Wanjiku@Example.com');
  });

  it('shows a 422 password_too_weak reason on the password field', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/register/farmer'), () =>
        errorResponse(422, 'password_too_weak', {
          extra: { reason: 'This password is too common.' },
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/register');
    await fillForm(user);
    await submit(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent('This password is too common.');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('maps other 422 field errors to the fields', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/register/farmer'), () =>
        validationErrorResponse([
          { field: 'email', message: 'value is not a valid email address' },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderApp('/register');
    await fillForm(user);
    await submit(user);
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('uses the countdown on 429', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/register/farmer'), () =>
        errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '30' } }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/register');
    await fillForm(user);
    await submit(user);
    expect(
      await screen.findByText('Too many attempts. Try again in 30 seconds.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again in 30 s' })).toBeDisabled();
  });
});

describe('RegisterVerifyScreen', () => {
  /** @param {ReturnType<typeof userEvent.setup>} user */
  async function reachVerify(user, role = /** @type {'farmer' | 'buyer'} */ ('farmer')) {
    const { router } = renderApp('/register');
    await fillForm(user, { role });
    await submit(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/register/verify'));
    expect(await screen.findByRole('heading', { name: 'Confirm your email' })).toHaveFocus();
    return router;
  }

  it.each([
    ['farmer', '/farmer'],
    ['buyer', '/buyer/browse'],
  ])('signs a %s in on 201 and opens the role home, without calling login', async (role, home) => {
    const seen = recordRequests();
    const user = userEvent.setup();
    const router = await reachVerify(user, /** @type {'farmer' | 'buyer'} */ (role));
    await enterCode(user, 'wxyz 6789');
    await waitFor(() => expect(router.state.location.pathname).toBe(home));
    expect(seen.verify).toEqual([
      { registration_token: fixtures.registrationAccepted.registration_token, code: 'WXYZ6789' },
    ]);
    expect(seen.login).toBe(0);
    expect(getSession()).toMatchObject({ role, name: 'Wanjiku Kamau' });
    expect(getFlow('register')).toBeNull();
  });

  it('shows the generic message on a wrong code, with "Send a new code" and "Start again"', async () => {
    recordRequests();
    server.use(
      http.post(apiUrl('/api/v1/auth/register/verify'), () =>
        errorResponse(400, 'invalid_or_expired_code'),
      ),
    );
    const user = userEvent.setup();
    await reachVerify(user);
    await enterCode(user);
    expect(
      await screen.findByText(
        'That code is incorrect or has expired. Request a new code or start again.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveValue('');
    expect(screen.getByLabelText('Code')).toHaveFocus();
    expect(screen.getByRole('button', { name: /Send a new code/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start again' })).toBeInTheDocument();
  });

  it('resend always shows the generic text and restarts the countdown from the server', async () => {
    recordRequests({ accepted: { ...fixtures.registrationAccepted, resend_available_in: 0 } });
    server.use(
      http.post(apiUrl('/api/v1/auth/register/resend'), () =>
        HttpResponse.json(
          { ...fixtures.registrationResent, resend_available_in: 50 },
          { status: 202 },
        ),
      ),
    );
    const user = userEvent.setup();
    await reachVerify(user);
    await user.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByText('If a code can be sent, it is on its way.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send a new code in (50|49) s/ })).toBeDisabled();
  });

  it('starts with the countdown from resend_available_in', async () => {
    recordRequests();
    const user = userEvent.setup();
    await reachVerify(user);
    expect(screen.getByRole('button', { name: /Send a new code in (60|59) s/ })).toBeDisabled();
  });

  it('uses the wait pattern on 429', async () => {
    recordRequests();
    server.use(
      http.post(apiUrl('/api/v1/auth/register/verify'), () =>
        errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '20' } }),
      ),
    );
    const user = userEvent.setup();
    await reachVerify(user);
    await enterCode(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again in 20 seconds.',
    );
    expect(screen.getByRole('button', { name: 'Try again in 20 s' })).toBeDisabled();
  });

  it('"Start again" clears the flow and goes to /register', async () => {
    recordRequests();
    const user = userEvent.setup();
    const router = await reachVerify(user);
    await user.click(screen.getByRole('link', { name: 'Start again' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/register'));
    expect(getFlow('register')).toBeNull();
  });

  it('a reload redirects to /register with registration_lost', async () => {
    const { router } = renderApp('/register/verify');
    await waitFor(() => expect(router.state.location.pathname).toBe('/register'));
    expect(
      await screen.findByText('Your registration was interrupted. Please start again.'),
    ).toBeInTheDocument();
  });

  it('keeps the password, the code and the registration token out of every store and the URL', async () => {
    recordRequests();
    const user = userEvent.setup();
    const router = await reachVerify(user);
    const exposed = () =>
      JSON.stringify({
        session: { ...window.sessionStorage },
        local: { ...window.localStorage },
        url: window.location.href,
        path: `${router.state.location.pathname}${router.state.location.search}`,
        state: router.state.location.state,
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
    expect(window.sessionStorage.getItem('agrisence.session')).toBeNull();
    for (const secret of SECRETS) expect(exposed()).not.toContain(secret);
    await enterCode(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
    for (const secret of SECRETS) expect(exposed()).not.toContain(secret);
    await act(async () => {});
    expect(within(document.body).queryByText(PASSWORD)).not.toBeInTheDocument();
  });
});
