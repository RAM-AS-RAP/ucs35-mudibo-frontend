import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, validationErrorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { loginAs, logout, renderApp } from '@/test/render';
import { getSession } from '@/auth/session';
import { queryClient } from '@/lib/queryClient';

const CURRENT = 'Old#Pass2025';
const NEW = 'Mavuno#2026';

afterEach(() => logout());

/**
 * @param {ReturnType<typeof userEvent.setup>} user
 * @param {{ current?: string, next?: string, confirm?: string }} [values]
 */
async function fillChange(user, { current = CURRENT, next = NEW, confirm = next } = {}) {
  await user.type(await screen.findByLabelText('Current password'), current);
  await user.type(screen.getByLabelText('New password'), next);
  await user.type(screen.getByLabelText('Confirm new password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Change password' }));
}

/** Count change-password requests. */
function countRequests() {
  const seen = { calls: 0, body: /** @type {any} */ (null) };
  server.use(
    http.post(apiUrl('/api/v1/auth/change-password'), async ({ request }) => {
      seen.calls += 1;
      seen.body = await request.json();
      return HttpResponse.json(fixtures.passwordChanged);
    }),
  );
  return seen;
}

describe('ChangePasswordScreen', () => {
  it('forced mode explains why, offers only sign out, and the guard keeps it there', async () => {
    loginAs('farmer', { mustChangePassword: true });
    const { router } = renderApp('/farmer/prices');
    expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
    expect(
      screen.getByText('For your security, you must set a new password before continuing.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    await router.navigate('/farmer');
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
  });

  it('voluntary mode has a cancel link back to the role home', async () => {
    loginAs('buyer');
    renderApp('/change-password');
    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/buyer');
  });

  it('needs 12 characters for an admin but 8 for a farmer', async () => {
    const seen = countRequests();
    const user = userEvent.setup();
    loginAs('admin');
    const admin = renderApp('/change-password');
    await fillChange(user);
    expect(
      await screen.findByText('The password does not meet the requirements below.'),
    ).toBeInTheDocument();
    expect(screen.getByText('12 to 128 characters')).toBeInTheDocument();
    expect(seen.calls).toBe(0);
    admin.unmount();
    logout();

    loginAs('farmer');
    const { router } = renderApp('/change-password');
    expect(await screen.findByText('8 to 128 characters')).toBeInTheDocument();
    await fillChange(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(seen.calls).toBe(1);
    expect(seen.body).toEqual({ current_password: CURRENT, new_password: NEW });
  });

  it('requires the new password to differ from the current one', async () => {
    const seen = countRequests();
    loginAs('farmer');
    const user = userEvent.setup();
    renderApp('/change-password');
    await fillChange(user, { current: NEW, next: NEW });
    expect(
      await screen.findByText('The new password must be different from your current password.'),
    ).toBeInTheDocument();
    expect(seen.calls).toBe(0);
  });

  it('shows wrong_current_password on the current password field', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/change-password'), () =>
        errorResponse(400, 'wrong_current_password'),
      ),
    );
    loginAs('farmer');
    const user = userEvent.setup();
    renderApp('/change-password');
    await fillChange(user);
    expect(await screen.findByRole('alert')).toHaveFocus();
    expect(document.getElementById('change-currentPassword-error')).toHaveTextContent(
      'Your current password is incorrect.',
    );
    expect(screen.getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true');
    expect(getSession()).not.toBeNull();
  });

  it('shows a 422 on the new password field', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/change-password'), () =>
        validationErrorResponse([
          {
            field: 'request',
            message: 'Value error, New password must differ from current password',
          },
        ]),
      ),
    );
    loginAs('farmer');
    const user = userEvent.setup();
    renderApp('/change-password');
    await fillChange(user);
    await screen.findByRole('alert');
    expect(document.getElementById('change-newPassword-error')).toHaveTextContent(
      'New password must differ from current password.',
    );
  });

  it('success clears the session, the query cache and sessionStorage, then shows the flash', async () => {
    countRequests();
    loginAs('farmer');
    queryClient.setQueryData(['orders', 'mine'], [{ id: 1 }]);
    const user = userEvent.setup();
    const { router } = renderApp('/change-password');
    await fillChange(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText('Password changed. Please sign in again.')).toBeInTheDocument();
    expect(getSession()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
    // Only the login screen's public health checks may be cached again.
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => query.queryKey[0] !== 'system'),
    ).toHaveLength(0);
  });
});
