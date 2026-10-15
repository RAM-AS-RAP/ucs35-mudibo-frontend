import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, tokenFor, validationErrorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout, renderApp } from '@/test/render';
import { getSession } from '@/auth/session';

const PASSWORD = 'Mavuno#2026';

afterEach(() => logout());

/** Record the register requests (path and body) and the login identifier. */
function recordRequests() {
  const seen = {
    register: /** @type {{ path: string, body: any }[]} */ ([]),
    login: /** @type {any[]} */ ([]),
  };
  for (const role of ['farmer', 'buyer']) {
    server.use(
      http.post(apiUrl(`/api/v1/auth/register/${role}`), async ({ request }) => {
        seen.register.push({ path: new URL(request.url).pathname, body: await request.json() });
        return HttpResponse.json({ ...fixtures.registeredUser, role }, { status: 201 });
      }),
    );
  }
  server.use(
    http.post(apiUrl('/api/v1/auth/login'), async ({ request }) => {
      const body = /** @type {any} */ (await request.json());
      seen.login.push(body.identifier);
      const role = seen.register.at(-1)?.path.endsWith('buyer') ? 'buyer' : 'farmer';
      return HttpResponse.json(tokenFor({ role }));
    }),
    http.get(apiUrl('/api/v1/auth/me'), () => {
      const role = seen.register.at(-1)?.path.endsWith('buyer') ? 'buyer' : 'farmer';
      return HttpResponse.json({ ...fixtures.userMe, role });
    }),
  );
  return seen;
}

/**
 * @param {ReturnType<typeof userEvent.setup>} user
 * @param {{ role?: 'farmer' | 'buyer' | null, name?: string, phone?: string, email?: string, password?: string, confirm?: string }} [values]
 */
async function fillForm(user, values = {}) {
  const {
    role = 'farmer',
    name = 'Wanjiku Kamau',
    phone = '0712 345 678',
    email = '',
    password = PASSWORD,
    confirm = password,
  } = values;
  if (role) await user.click(await screen.findByLabelText(new RegExp(`I am a ${role}`)));
  if (name) await user.type(screen.getByLabelText('Full name'), name);
  if (phone) await user.type(screen.getByLabelText('Phone number'), phone);
  if (email) await user.type(screen.getByLabelText('Email (optional)'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  if (confirm) await user.type(screen.getByLabelText('Confirm password'), confirm);
}

const submit = (user) => user.click(screen.getByRole('button', { name: 'Create account' }));

describe('RegisterScreen', () => {
  it('has no default role choice', async () => {
    renderApp('/register');
    const farmer = await screen.findByLabelText(/I am a farmer/);
    expect(farmer).not.toBeChecked();
    expect(screen.getByLabelText(/I am a buyer/)).not.toBeChecked();
  });

  it('preselects the role from ?role=', async () => {
    renderApp('/register?role=buyer');
    expect(await screen.findByLabelText(/I am a buyer/)).toBeChecked();
    expect(screen.getByLabelText(/I am a farmer/)).not.toBeChecked();
  });

  it('ignores an unknown ?role=', async () => {
    renderApp('/register?role=admin');
    expect(await screen.findByLabelText(/I am a farmer/)).not.toBeChecked();
    expect(screen.getByLabelText(/I am a buyer/)).not.toBeChecked();
  });

  it('requires the role choice and shows the client errors', async () => {
    const user = userEvent.setup();
    const seen = recordRequests();
    renderApp('/register');
    await fillForm(user, { role: null, phone: '0812345678', password: 'short', confirm: 'other' });
    await submit(user);
    expect(
      await screen.findByText('Choose whether you are a farmer or a buyer.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Enter a Kenyan mobile number, for example 0712 345 678.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The password does not meet the requirements below.'),
    ).toBeInTheDocument();
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
    expect(seen.register).toHaveLength(0);
  });

  it.each([
    ['farmer', '/api/v1/auth/register/farmer', '/farmer'],
    ['buyer', '/api/v1/auth/register/buyer', '/buyer'],
  ])(
    'a %s registers on its own endpoint, signs in with the normalised phone and goes home',
    async (role, path, home) => {
      const user = userEvent.setup();
      const seen = recordRequests();
      const { router } = renderApp('/register');
      await fillForm(user, {
        role: /** @type {'farmer' | 'buyer'} */ (role),
        phone: '+254 712-345-678',
      });
      await submit(user);
      await waitFor(() => expect(router.state.location.pathname).toBe(home));
      expect(seen.register).toEqual([
        {
          path,
          body: { name: 'Wanjiku Kamau', phone_number: '254712345678', password: PASSWORD },
        },
      ]);
      expect(seen.login).toEqual(['254712345678']);
      expect(getSession()?.role).toBe(role);
    },
  );

  it('sends exactly the allowed keys, never role, and includes a given email', async () => {
    const user = userEvent.setup();
    const seen = recordRequests();
    const { router } = renderApp('/register?role=farmer');
    await fillForm(user, { role: null, email: 'wanjiku@example.com' });
    await submit(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
    const body = seen.register[0].body;
    expect(Object.keys(body).sort()).toEqual(['email', 'name', 'password', 'phone_number']);
    expect(body).not.toHaveProperty('role');
    expect(body.email).toBe('wanjiku@example.com');
  });

  it('shows the generic 409 message with sign in and reset links', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/register/farmer'), () =>
        errorResponse(409, 'conflict', { requestId: 'req-409' }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/register');
    await fillForm(user);
    await submit(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('An account with these details already exists.');
    expect(within(alert).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(within(alert).getByRole('link', { name: 'Reset your password' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(alert).toHaveFocus();
  });

  it('maps 422 field errors to the fields', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/register/farmer'), () =>
        validationErrorResponse([
          {
            field: 'phone_number',
            message: 'Value error, Enter a valid Kenyan mobile phone number',
          },
          { field: 'password', message: 'Value error, Password must contain a symbol' },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderApp('/register');
    await fillForm(user);
    await submit(user);
    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByRole('link', { name: 'Enter a valid Kenyan mobile phone number.' }),
    ).toHaveAttribute('href', '#register-phone');
    const phoneError = document.getElementById('register-phone-error');
    expect(phoneError).toHaveTextContent('Enter a valid Kenyan mobile phone number.');
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById('register-password-error')).toHaveTextContent(
      'Password must contain a symbol.',
    );
  });

  it('shows a 422 password_too_weak reason on the password field', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/register/buyer'), () =>
        errorResponse(422, 'password_too_weak', {
          extra: { reason: 'This password is too common.' },
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/register');
    await fillForm(user, { role: 'buyer' });
    await submit(user);
    await screen.findByRole('alert');
    expect(document.getElementById('register-password-error')).toHaveTextContent(
      'This password is too common.',
    );
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again in 30 seconds.',
    );
    expect(screen.getByRole('button', { name: 'Try again in 30 s' })).toBeDisabled();
  });

  it('falls back to /login with a flash when the automatic sign in fails', async () => {
    server.use(http.post(apiUrl('/api/v1/auth/login'), () => errorResponse(503, 'busy')));
    const user = userEvent.setup();
    const { router } = renderApp('/register');
    await fillForm(user);
    await submit(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText('Account created. Please sign in.')).toBeInTheDocument();
    expect(getSession()).toBeNull();
  });

  it('shows the research prototype note', async () => {
    renderApp('/register');
    expect(
      await screen.findByText(/Payments run in the M-Pesa test environment \(sandbox\)/),
    ).toBeInTheDocument();
  });
});
