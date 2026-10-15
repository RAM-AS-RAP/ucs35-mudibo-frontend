import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { loginAs, logout, renderApp } from '@/test/render';
import { getSession } from '@/auth/session';

const NEW_PASSWORD = 'mavuno-harvest';
const CONFIRMATION =
  'If an account with that email exists, we have sent a code. It is valid for 15 minutes.';

afterEach(() => {
  vi.useRealTimers();
  logout();
});

/** @param {ReturnType<typeof userEvent.setup>} user */
async function requestCode(user, email = 'wanjiku@example.com') {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Send code' }));
}

/**
 * @param {ReturnType<typeof userEvent.setup>} user
 * @param {{ email?: string, code?: string, password?: string }} [values]
 */
async function fillReset(
  user,
  { email = 'wanjiku@example.com', code = 'abcd-2345', password = NEW_PASSWORD } = {},
) {
  const emailField = await screen.findByLabelText('Email');
  if (email) await user.type(emailField, email);
  await user.type(screen.getByLabelText('Code'), code);
  await user.type(screen.getByLabelText('New password'), password);
  await user.type(screen.getByLabelText('Confirm new password'), password);
  await user.click(screen.getByRole('button', { name: 'Set new password' }));
}

describe('ForgotPasswordScreen', () => {
  it.each(['If the email matches an account, a code has been sent.', 'Something else entirely.'])(
    'shows the same confirmation for any 202 (%s)',
    async (serverMessage) => {
      server.use(
        http.post(apiUrl('/api/v1/auth/password-reset/request'), () =>
          HttpResponse.json({ message: serverMessage }, { status: 202 }),
        ),
      );
      const user = userEvent.setup();
      renderApp('/forgot-password');
      await requestCode(user);
      expect(await screen.findByText(CONFIRMATION)).toBeInTheDocument();
      expect(screen.queryByText(serverMessage)).not.toBeInTheDocument();
    },
  );

  it('continues to the reset screen with the email in router state, not in the URL', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/forgot-password');
    await requestCode(user);
    await user.click(await screen.findByRole('button', { name: 'Enter the code' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/reset-password'));
    expect(router.state.location.search).toBe('');
    expect(router.state.location.hash).toBe('');
    expect(router.state.location.state).toEqual({ email: 'wanjiku@example.com' });
    expect(await screen.findByLabelText('Email')).toHaveValue('wanjiku@example.com');
  });

  it('says accounts without an email cannot reset a password', async () => {
    renderApp('/forgot-password');
    expect(
      await screen.findByText(
        'Accounts without an email address cannot reset a forgotten password.',
      ),
    ).toBeInTheDocument();
  });

  it('uses the countdown on 429', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/password-reset/request'), () =>
        errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '15' } }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/forgot-password');
    await requestCode(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again in 15 seconds.',
    );
    expect(screen.getByRole('button', { name: 'Try again in 15 s' })).toBeDisabled();
  });
});

describe('ResetPasswordScreen', () => {
  it('tidies the code as typed: upper case, no spaces, one hyphen', async () => {
    const user = userEvent.setup();
    renderApp('/reset-password');
    const code = await screen.findByLabelText('Code');
    await user.type(code, 'abcd efgh');
    expect(code).toHaveValue('ABCDEFGH');
    await user.clear(code);
    await user.type(code, 'ab-cd-ef gh2');
    expect(code).toHaveValue('AB-CDEFGH');
    await user.clear(code);
    await user.click(code);
    await user.paste(' abcd-2345 ');
    expect(code).toHaveValue('ABCD-2345');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('inputmode', 'text');
  });

  it('sends the code and ends on login with the flash after 204', async () => {
    /** @type {any} */
    let body = null;
    server.use(
      http.post(apiUrl('/api/v1/auth/password-reset/confirm'), async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/reset-password');
    await fillReset(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText('Password updated. Please sign in.')).toBeInTheDocument();
    expect(body).toEqual({
      email: 'wanjiku@example.com',
      code: 'ABCD-2345',
      new_password: NEW_PASSWORD,
    });
  });

  it('shows the generic 400 message and a resend control with a 60 second cooldown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(
      http.post(apiUrl('/api/v1/auth/password-reset/confirm'), () =>
        errorResponse(400, 'invalid_or_expired_code'),
      ),
    );
    let resendCalls = 0;
    server.use(
      http.post(apiUrl('/api/v1/auth/password-reset/request'), () => {
        resendCalls += 1;
        return HttpResponse.json({ message: 'whatever' }, { status: 202 });
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/reset-password');
    await fillReset(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That code is incorrect or has expired.');
    expect(alert).toHaveFocus();

    await user.click(within(alert).getByRole('button', { name: 'Send me a new code' }));
    expect(
      await screen.findByText(
        'If an account with that email exists, we have sent a new code. It is valid for 15 minutes.',
      ),
    ).toBeInTheDocument();
    expect(resendCalls).toBe(1);
    const cooling = screen.getByRole('button', { name: 'Try again in 60 s' });
    expect(cooling).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByRole('button', { name: 'Try again in 30 s' })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByRole('button', { name: 'Send me a new code' })).toBeEnabled();
  });

  it('shows a 422 password_too_weak reason on the password field', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/password-reset/confirm'), () =>
        errorResponse(422, 'password_too_weak', {
          extra: { reason: 'The password must not be your email, name or phone number.' },
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/reset-password');
    await fillReset(user);
    await screen.findByRole('alert');
    expect(document.getElementById('reset-password-error')).toHaveTextContent(
      'The password must not be your email, name or phone number.',
    );
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('uses the countdown on 429', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/password-reset/confirm'), () =>
        errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '20' } }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/reset-password');
    await fillReset(user);
    expect(await screen.findByRole('button', { name: 'Try again in 20 s' })).toBeDisabled();
  });

  it('shows SignedInNotice to a signed in user, and the form after signing out', async () => {
    loginAs('farmer');
    const user = userEvent.setup();
    const { router } = renderApp('/reset-password');
    expect(
      await screen.findByText('You are signed in as another account. Sign out to continue.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Code')).toBeInTheDocument();
    expect(getSession()).toBeNull();
    expect(router.state.location.pathname).toBe('/reset-password');
  });
});
