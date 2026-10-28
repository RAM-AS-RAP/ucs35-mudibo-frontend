import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, validationErrorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { loginAs, logout, renderApp } from '@/test/render';
import { expectNoAxeViolations } from '@/test/axe';
import { installGoogleStub, removeGoogleStub } from '@/test/googleStub';
import { getSession, setProfile } from '@/auth/session';
import { queryClient } from '@/lib/queryClient';

const PASSWORD = 'Mavuno#2026-new';
const CODE = 'ABCD2345';
/** @type {import('vitest').MockInstance[]} */
let consoleSpies;

/** @param {{ password_set?: boolean, google_linked?: boolean, role?: string }} fields */
function meAs(fields) {
  server.use(
    http.get(apiUrl('/api/v1/auth/me'), () =>
      HttpResponse.json({ ...fixtures.userMeGoogle, ...fields }),
    ),
  );
}

beforeEach(() => {
  consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m));
});

afterEach(() => {
  const places = [
    JSON.stringify({ ...window.sessionStorage }),
    window.location.href,
    JSON.stringify(window.history.state),
    JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((q) => [q.queryKey, q.state.data]),
    ),
    ...consoleSpies.map((spy) => JSON.stringify(spy.mock.calls)),
  ];
  for (const place of places) {
    expect(place).not.toContain(PASSWORD);
    expect(place).not.toContain(CODE);
  }
  for (const spy of consoleSpies) spy.mockRestore();
  removeGoogleStub();
  logout();
});

describe('account menu', () => {
  it.each([
    ['farmer', '/farmer'],
    ['buyer', '/buyer/browse'],
  ])('offers Sign-in methods to a %s', async (role, path) => {
    loginAs(role);
    const user = userEvent.setup();
    renderApp(path);
    await user.click(await screen.findByRole('button', { name: /account menu/i }));
    const item = await screen.findByRole('menuitem', { name: 'Sign-in methods' });
    expect(item).toHaveAttribute('href', '/account/security');
    expect(screen.getByRole('menuitem', { name: 'Change password' })).toBeInTheDocument();
  });

  it('keeps Change password only for administrators, who get Forbidden on the account screens', async () => {
    loginAs('admin');
    const user = userEvent.setup();
    const { unmount } = renderApp('/admin/users');
    await user.click(await screen.findByRole('button', { name: /account menu/i }));
    expect(await screen.findByRole('menuitem', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Sign-in methods' })).not.toBeInTheDocument();
    unmount();
    for (const path of ['/account/security', '/account/password']) {
      const view = renderApp(path);
      expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
      view.unmount();
    }
  });
});

describe('AccountSecurityScreen', () => {
  it.each([
    [true, false, 'Set', 'Change password', 'Not connected', /sign in once with Google/],
    [true, true, 'Set', 'Change password', 'Connected', /continue with Google on the sign in/],
    [false, true, 'Not set', 'Set a password', 'Connected', /continue with Google on the sign in/],
    [false, false, 'Not set', 'Set a password', 'Not connected', /sign in once with Google/],
  ])(
    'password_set %s, google_linked %s',
    async (passwordSet, googleLinked, passwordWord, link, googleWord, googleText) => {
      loginAs('buyer');
      meAs({ password_set: passwordSet, google_linked: googleLinked });
      const { container } = renderApp('/account/security');
      expect(
        await screen.findByRole('heading', { name: 'Sign-in methods', level: 1 }),
      ).toBeVisible();
      const email = (await screen.findByRole('heading', { name: 'Email' })).closest('li');
      expect(within(/** @type {HTMLElement} */ (email)).getByText('Verified')).toBeVisible();
      expect(
        within(/** @type {HTMLElement} */ (email)).getByText('achieng.google@example.com'),
      ).toBeVisible();
      const password = /** @type {HTMLElement} */ (
        screen.getByRole('heading', { name: 'Password' }).closest('li')
      );
      expect(within(password).getByText(passwordWord)).toBeVisible();
      expect(within(password).getByRole('link', { name: link })).toHaveAttribute(
        'href',
        passwordSet ? '/change-password' : '/account/password',
      );
      const google = /** @type {HTMLElement} */ (
        screen.getByRole('heading', { name: 'Google' }).closest('li')
      );
      expect(within(google).getByText(googleWord)).toBeVisible();
      expect(within(google).getByText(googleText)).toBeVisible();
      expect(within(google).getByText('Google cannot be disconnected from here.')).toBeVisible();
      // No connect, disconnect, link or unlink control.
      expect(screen.queryByRole('button', { name: /connect|link/i })).not.toBeInTheDocument();
      expect(screen.getByText(/then a code we email to you/)).toBeVisible();
      expect(screen.getByText(/No password and no code are needed/)).toBeVisible();
      expect(getSession()).toMatchObject({ passwordSet, googleLinked });
      await expectNoAxeViolations(container);
    },
  );

  it('shows the error with Try again when the profile cannot load', async () => {
    loginAs('farmer');
    server.use(http.get(apiUrl('/api/v1/auth/me'), () => errorResponse(500, 'internal_error')));
    renderApp('/account/security');
    expect(
      await screen.findByText('Your sign-in methods could not be loaded', {}, { timeout: 8000 }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

describe('SetPasswordScreen', () => {
  /** @type {{ request: unknown[], confirm: unknown[] }} */
  let sent;
  beforeEach(() => {
    sent = { request: [], confirm: [] };
    loginAs('buyer');
    meAs({ password_set: false, google_linked: true });
  });

  /** @param {() => Response} [confirm] @param {() => Response} [request] */
  function backend(
    confirm = () => new HttpResponse(null, { status: 204 }),
    request = () => HttpResponse.json(fixtures.codeRequested, { status: 202 }),
  ) {
    server.use(
      http.post(apiUrl('/api/v1/auth/password-reset/request'), async ({ request: r }) => {
        sent.request.push(await r.clone().json());
        return request();
      }),
      http.post(apiUrl('/api/v1/auth/password-reset/confirm'), async ({ request: r }) => {
        sent.confirm.push(await r.clone().json());
        return confirm();
      }),
    );
  }

  /** @param {ReturnType<typeof userEvent.setup>} user */
  async function toCodeStep(user) {
    await user.click(await screen.findByRole('button', { name: 'Email me a code' }));
    return screen.findByLabelText('Code');
  }

  /** @param {ReturnType<typeof userEvent.setup>} user */
  async function fillAndSubmit(user, { code = CODE, password = PASSWORD } = {}) {
    await user.type(screen.getByLabelText('Code'), code);
    await user.type(screen.getByLabelText('New password'), password);
    await user.type(screen.getByLabelText('Confirm new password'), password);
    await user.click(screen.getByRole('button', { name: 'Set password' }));
  }

  it('asks for a code for the email from /auth/me, then sets the password and signs out', async () => {
    backend();
    const user = userEvent.setup();
    const { router, container } = renderApp('/account/password');
    expect(
      await screen.findByText(
        'Set a password to also sign in with your email. We will email a code to achieng.google@example.com.',
      ),
    ).toBeVisible();
    // The email is never typed: there is no email field.
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
    await toCodeStep(user);
    expect(sent.request).toEqual([{ email: 'achieng.google@example.com' }]);
    expect(screen.getByRole('button', { name: /Send a new code in \d+ s/ })).toBeDisabled();
    await expectNoAxeViolations(container);
    await fillAndSubmit(user);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(sent.confirm).toEqual([
      { email: 'achieng.google@example.com', code: CODE, new_password: PASSWORD },
    ]);
    expect(getSession()).toBeNull();
    expect(
      await screen.findByText(
        'Password changed. Please sign in again. You can now sign in with your email, password and a code, or continue with Google.',
      ),
    ).toBeVisible();
  });

  it('shows client validation errors', async () => {
    backend();
    const user = userEvent.setup();
    const { container } = renderApp('/account/password');
    await toCodeStep(user);
    await user.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByText('Enter the code from the email.')).toBeVisible();
    expect(screen.getByText('Enter your password.')).toBeVisible();
    await expectNoAxeViolations(container);
    expect(sent.confirm).toEqual([]);
  });

  it('400 shows the generic code message; the resend control waits 60 seconds', async () => {
    backend(() => errorResponse(400, 'invalid_or_expired_code'));
    const user = userEvent.setup();
    const { container } = renderApp('/account/password');
    await toCodeStep(user);
    await fillAndSubmit(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That code is incorrect or has expired.');
    expect(alert).toHaveFocus();
    expect(screen.getByRole('button', { name: /Send a new code in (59|60) s/ })).toBeDisabled();
    await expectNoAxeViolations(container);
  });

  it('422 puts the reason on the password field', async () => {
    backend(() =>
      validationErrorResponse([{ field: 'new_password', message: 'This password is too common.' }]),
    );
    const user = userEvent.setup();
    renderApp('/account/password');
    await toCodeStep(user);
    await fillAndSubmit(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This password is too common.');
    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
      /This password is too common/,
    );
  });

  it('429 uses the wait pattern', async () => {
    backend(() => errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '45' } }));
    const user = userEvent.setup();
    renderApp('/account/password');
    await toCodeStep(user);
    await fillAndSubmit(user);
    expect(await screen.findByText('Too many attempts. Try again in 45 seconds.')).toBeVisible();
    expect(screen.getByRole('button', { name: /Try again in \d+ s/ })).toBeDisabled();
  });

  it('an account that has a password gets a link to change it', async () => {
    meAs({ password_set: true });
    renderApp('/account/password');
    expect(await screen.findByText('You already have a password')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Change password' })).toHaveAttribute(
      'href',
      '/change-password',
    );
    expect(screen.queryByRole('button', { name: 'Email me a code' })).not.toBeInTheDocument();
  });
});

describe('ChangePasswordScreen and accounts without a password', () => {
  it('shows the message instead of the form when the profile says no password', async () => {
    loginAs('buyer');
    setProfile({ ...fixtures.userMeGoogle });
    const { container } = renderApp('/change-password');
    expect(
      await screen.findByText('You have not set a password yet. Set one from Sign-in methods.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Set a password' })).toHaveAttribute(
      'href',
      '/account/password',
    );
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('maps 409 password_not_set to the message and the link', async () => {
    loginAs('farmer');
    server.use(
      http.post(apiUrl('/api/v1/auth/change-password'), () =>
        errorResponse(409, 'password_not_set'),
      ),
    );
    const user = userEvent.setup();
    renderApp('/change-password');
    await user.type(await screen.findByLabelText('Current password'), 'Old#Password1');
    await user.type(screen.getByLabelText('New password'), 'Mavuno#2026-xyz');
    await user.type(screen.getByLabelText('Confirm new password'), 'Mavuno#2026-xyz');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'You have not set a password yet. Set one from Sign-in methods.',
    );
    expect(within(alert).getByRole('link', { name: 'Set a password' })).toHaveAttribute(
      'href',
      '/account/password',
    );
  });
});

describe('sign out', () => {
  it('calls disableAutoSelect when the library was loaded, and nothing else of Google', async () => {
    const stub = installGoogleStub();
    loginAs('farmer');
    const user = userEvent.setup();
    const { router } = renderApp('/farmer');
    await user.click(await screen.findByRole('button', { name: /account menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(stub.disableAutoSelect).toHaveBeenCalledTimes(1);
    expect(stub.initialize).not.toHaveBeenCalled();
    expect(stub.renderButton).not.toHaveBeenCalled();
    expect(stub.prompt).not.toHaveBeenCalled();
    expect(stub.cancel).not.toHaveBeenCalled();
  });

  it('signs out without Google when the library was never loaded', async () => {
    loginAs('buyer');
    const user = userEvent.setup();
    const { router } = renderApp('/buyer/browse');
    await user.click(await screen.findByRole('button', { name: /account menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(window.google).toBeUndefined();
  });
});
