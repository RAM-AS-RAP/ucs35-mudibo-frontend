import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, tokenFor } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { loginAs, logout, renderApp } from '@/test/render';
import { getSession } from '@/auth/session';

const ADMIN_PASSWORD = 'mavuno-harvest-26';

afterEach(() => logout());

/**
 * @param {ReturnType<typeof userEvent.setup>} user
 * @param {{ password?: string }} [values]
 */
async function fillInvite(user, { password = ADMIN_PASSWORD } = {}) {
  await user.type(await screen.findByLabelText('Email'), 'amina.admin@example.com');
  await user.type(screen.getByLabelText('Invitation code'), 'wxyz 6789');
  await user.type(screen.getByLabelText('Password'), password);
  await user.type(screen.getByLabelText('Confirm password'), password);
  await user.click(screen.getByRole('button', { name: 'Create administrator account' }));
}

describe('AcceptInviteScreen', () => {
  it('enforces 12 characters on the client', async () => {
    let calls = 0;
    server.use(
      http.post(apiUrl('/api/v1/auth/accept-invite'), () => {
        calls += 1;
        return HttpResponse.json(fixtures.adminMe, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/accept-invite');
    await fillInvite(user, { password: 'eleven-char' });
    expect(
      await screen.findByText('The password does not meet the requirements below.'),
    ).toBeInTheDocument();
    expect(screen.getByText('12 to 128 characters')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(calls).toBe(0);
  });

  it('signs the new administrator in and opens the admin home', async () => {
    /** @type {any} */
    let loginBody = null;
    server.use(
      http.post(apiUrl('/api/v1/auth/login'), async ({ request }) => {
        loginBody = await request.json();
        return HttpResponse.json(tokenFor({ role: 'admin' }));
      }),
      http.get(apiUrl('/api/v1/auth/me'), () => HttpResponse.json(fixtures.adminMe)),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/accept-invite');
    await fillInvite(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    expect(loginBody).toEqual({ identifier: 'amina.admin@example.com', password: ADMIN_PASSWORD });
    expect(await screen.findByText('Welcome, Amina Odhiambo')).toBeInTheDocument();
    expect(getSession()?.isSuperAdmin).toBe(false);
  });

  it('falls back to /login with a flash when the sign in fails', async () => {
    server.use(http.post(apiUrl('/api/v1/auth/login'), () => HttpResponse.error()));
    const user = userEvent.setup();
    const { router } = renderApp('/accept-invite');
    await fillInvite(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText('Account created. Please sign in.')).toBeInTheDocument();
  });

  it('shows the generic 400 message, the guidance and the request a new code flow', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/accept-invite'), () =>
        errorResponse(400, 'invalid_or_expired_code'),
      ),
    );
    /** @type {any} */
    let requested = null;
    server.use(
      http.post(apiUrl('/api/v1/auth/invite/request-code'), async ({ request }) => {
        requested = await request.json();
        return HttpResponse.json(fixtures.codeRequested, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/accept-invite');
    await fillInvite(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That code is incorrect or has expired.');
    expect(alert).toHaveTextContent(
      'Too many attempts, or an invitation that expired? Ask the administrator who invited you to send a new one.',
    );
    await user.click(within(alert).getByRole('button', { name: 'Request a new code' }));
    expect(
      await screen.findByText('If an invitation for that email is open, we have sent a new code.'),
    ).toBeInTheDocument();
    expect(requested).toEqual({ email: 'amina.admin@example.com' });
    expect(screen.getByRole('button', { name: 'Try again in 60 s' })).toBeDisabled();
  });

  it('uses the countdown on 429', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/accept-invite'), () =>
        errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '9' } }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/accept-invite');
    await fillInvite(user);
    expect(await screen.findByRole('button', { name: 'Try again in 9 s' })).toBeDisabled();
  });

  it('shows SignedInNotice with the name to a signed in user', async () => {
    loginAs('buyer');
    const user = userEvent.setup();
    renderApp('/accept-invite');
    expect(await screen.findByText(/You are signed in as/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Invitation code')).toBeInTheDocument();
  });
});
