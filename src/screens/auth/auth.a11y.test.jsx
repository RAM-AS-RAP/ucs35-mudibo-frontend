// Accessibility of every authentication screen: axe in the default state, with client
// validation errors and with a server error, plus where focus goes after a failed submit.
import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { clearFlow, startFlow } from '@/auth/flow';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { expectNoAxeViolations } from '@/test/axe';
import { loginAs, logout, renderApp } from '@/test/render';

afterEach(() => {
  clearFlow();
  logout();
});

/**
 * @typedef {object} ScreenCase
 * @property {string} path
 * @property {string} heading
 * @property {string} submit
 * @property {string} firstField  label of the first field that is invalid when empty
 * @property {string} endpoint
 * @property {'farmer' | 'admin'} [signedInAs]
 * @property {(user: ReturnType<typeof userEvent.setup>) => Promise<void>} fill  a valid form
 */

/** @type {ScreenCase[]} */
const SCREENS = [
  {
    path: '/login',
    heading: 'Sign in',
    submit: 'Sign in',
    firstField: 'Email',
    endpoint: '/api/v1/auth/login',
    fill: async (user) => {
      await user.type(screen.getByLabelText('Email'), 'wanjiku@example.com');
      await user.type(screen.getByLabelText('Password'), 'Mavuno#2026');
    },
  },
  {
    path: '/register',
    heading: 'Create an account',
    submit: 'Create account',
    firstField: 'I am a farmer',
    endpoint: '/api/v1/auth/register/farmer',
    fill: async (user) => {
      await user.click(screen.getByLabelText(/I am a farmer/));
      await user.type(screen.getByLabelText('Full name'), 'Wanjiku Kamau');
      await user.type(screen.getByLabelText('Email'), 'wanjiku@example.com');
      await user.type(screen.getByLabelText('Password'), 'Mavuno#2026');
      await user.type(screen.getByLabelText('Confirm password'), 'Mavuno#2026');
    },
  },
  {
    path: '/forgot-password',
    heading: 'Forgot your password?',
    submit: 'Send code',
    firstField: 'Email',
    endpoint: '/api/v1/auth/password-reset/request',
    fill: async (user) => {
      await user.type(screen.getByLabelText('Email'), 'wanjiku@example.com');
    },
  },
  {
    path: '/reset-password',
    heading: 'Reset your password',
    submit: 'Set new password',
    firstField: 'Email',
    endpoint: '/api/v1/auth/password-reset/confirm',
    fill: async (user) => {
      await user.type(screen.getByLabelText('Email'), 'wanjiku@example.com');
      await user.type(screen.getByLabelText('Code'), 'ABCD2345');
      await user.type(screen.getByLabelText('New password'), 'mavuno-harvest');
      await user.type(screen.getByLabelText('Confirm new password'), 'mavuno-harvest');
    },
  },
  {
    path: '/accept-invite',
    heading: 'Accept your invitation',
    submit: 'Create administrator account',
    firstField: 'Email',
    endpoint: '/api/v1/auth/accept-invite',
    fill: async (user) => {
      await user.type(screen.getByLabelText('Email'), 'amina@example.com');
      await user.type(screen.getByLabelText('Invitation code'), 'ABCD2345');
      await user.type(screen.getByLabelText('Password'), 'mavuno-harvest-26');
      await user.type(screen.getByLabelText('Confirm password'), 'mavuno-harvest-26');
    },
  },
  {
    path: '/change-password',
    heading: 'Change password',
    submit: 'Change password',
    firstField: 'Current password',
    endpoint: '/api/v1/auth/change-password',
    signedInAs: 'farmer',
    fill: async (user) => {
      await user.type(screen.getByLabelText('Current password'), 'Old#Pass2025');
      await user.type(screen.getByLabelText('New password'), 'Mavuno#2026');
      await user.type(screen.getByLabelText('Confirm new password'), 'Mavuno#2026');
    },
  },
];

describe.each(SCREENS)('$path', (screenCase) => {
  /** @param {string} path */
  async function open(path) {
    if (screenCase.signedInAs) loginAs(screenCase.signedInAs);
    const utils = renderApp(path);
    await screen.findByRole('heading', { name: screenCase.heading, level: 1 });
    return utils;
  }

  it('has no axe violations in its default state, with a title and visible labels', async () => {
    const { container } = await open(screenCase.path);
    await expectNoAxeViolations(container, { page: true });
    expect(document.title).toBe(`${screenCase.heading} - AgriSence`);
    // Every input has a visible <label>; placeholders never stand in for one.
    for (const input of container.querySelectorAll('input:not([type="radio"])')) {
      expect(container.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
      expect(input).not.toHaveAttribute('placeholder');
    }
    expect(container.querySelector('form')).toHaveAttribute('novalidate');
  });

  it('focuses the first invalid field after a client error and stays accessible', async () => {
    const user = userEvent.setup();
    const { container } = await open(screenCase.path);
    await user.click(screen.getByRole('button', { name: screenCase.submit }));
    const first =
      screenCase.firstField === 'I am a farmer'
        ? screen.getByLabelText(/I am a farmer/)
        : screen.getByLabelText(screenCase.firstField);
    expect(first).toHaveFocus();
    await expectNoAxeViolations(container, { page: true });
  });

  it('focuses the error summary after a server error and stays accessible', async () => {
    server.use(
      http.post(apiUrl(screenCase.endpoint), () =>
        errorResponse(500, 'internal_error', { requestId: 'req-500' }),
      ),
    );
    const user = userEvent.setup();
    const { container } = await open(screenCase.path);
    await screenCase.fill(user);
    await user.click(screen.getByRole('button', { name: screenCase.submit }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong on our side. Please try again.');
    expect(alert).toHaveTextContent('Reference: req-500');
    expect(alert).toHaveFocus();
    await expectNoAxeViolations(container, { page: true });
  });
});

describe('signed in variants', () => {
  it.each([
    ['/reset-password', 'Reset your password'],
    ['/accept-invite', 'Accept your invitation'],
  ])('%s with SignedInNotice has no axe violations', async (path, heading) => {
    loginAs('farmer');
    const { container } = renderApp(path);
    await screen.findByRole('heading', { name: heading, level: 1 });
    await expectNoAxeViolations(container, { page: true });
  });

  it('the forced change password screen has no axe violations', async () => {
    loginAs('buyer', { mustChangePassword: true });
    const { container } = renderApp('/change-password');
    await screen.findByRole('heading', { name: 'Set a new password', level: 1 });
    await expectNoAxeViolations(container, { page: true });
  });
});

/** The two code screens, opened with a flow in the in memory store. */
const CODE_SCREENS = [
  {
    kind: /** @type {const} */ ('login'),
    path: '/login/code',
    heading: 'Check your email',
    submit: 'Sign in',
    endpoint: '/api/v1/auth/login/verify',
    resendEndpoint: '/api/v1/auth/login/resend',
    resendAnswer: () =>
      HttpResponse.json({
        code_sent: true,
        resend_available_in: 60,
        code_expires_at: '2026-10-26T09:20:00Z',
      }),
    resent: 'A new code was sent.',
  },
  {
    kind: /** @type {const} */ ('register'),
    path: '/register/verify',
    heading: 'Confirm your email',
    submit: 'Confirm email',
    endpoint: '/api/v1/auth/register/verify',
    resendEndpoint: '/api/v1/auth/register/resend',
    resendAnswer: () =>
      HttpResponse.json({ message: 'Sent.', resend_available_in: 60 }, { status: 202 }),
    resent: 'If a code can be sent, it is on its way.',
  },
];

describe.each(CODE_SCREENS)('$path', (codeCase) => {
  /** @param {number} [resendIn] */
  async function open(resendIn = 0) {
    startFlow(codeCase.kind, {
      token: 'flow-token-not-a-secret-0123456789',
      emailMasked: 'w***@e***.com',
      resendAvailableInSeconds: resendIn,
      codeSent: true,
    });
    const utils = renderApp(codeCase.path);
    await screen.findByRole('heading', { name: codeCase.heading, level: 1 });
    return utils;
  }

  it('has no axe violations in its default state, with a title and a visible label', async () => {
    const { container } = await open(60);
    await expectNoAxeViolations(container, { page: true });
    expect(document.title).toBe(`${codeCase.heading} - AgriSence`);
    const input = screen.getByLabelText('Code');
    expect(container.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('focuses the code field after a client error and stays accessible', async () => {
    const user = userEvent.setup();
    const { container } = await open();
    await user.click(screen.getByRole('button', { name: codeCase.submit }));
    expect(await screen.findByText('Enter the code from the email.')).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveFocus();
    await expectNoAxeViolations(container, { page: true });
  });

  it('focuses the error summary after a server error and stays accessible', async () => {
    server.use(
      http.post(apiUrl(codeCase.endpoint), () =>
        errorResponse(500, 'internal_error', { requestId: 'req-500' }),
      ),
    );
    const user = userEvent.setup();
    const { container } = await open();
    await user.type(screen.getByLabelText('Code'), 'ABCD2345');
    await user.click(screen.getByRole('button', { name: codeCase.submit }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Reference: req-500');
    expect(alert).toHaveFocus();
    await expectNoAxeViolations(container, { page: true });
  });

  it('returns focus to the code field after a wrong code and stays accessible', async () => {
    server.use(
      http.post(apiUrl(codeCase.endpoint), () => errorResponse(400, 'invalid_or_expired_code')),
    );
    const user = userEvent.setup();
    const { container } = await open();
    await user.type(screen.getByLabelText('Code'), 'ABCD2345');
    await user.click(screen.getByRole('button', { name: codeCase.submit }));
    await screen.findByText(/That code is incorrect or has expired/);
    expect(screen.getByLabelText('Code')).toHaveFocus();
    await expectNoAxeViolations(container, { page: true });
  });

  it('works with the keyboard only: type the code, resend, and announce the new code once', async () => {
    let resends = 0;
    server.use(
      http.post(apiUrl(codeCase.resendEndpoint), () => {
        resends += 1;
        return codeCase.resendAnswer();
      }),
    );
    const user = userEvent.setup();
    await open();
    await user.tab();
    expect(screen.getByLabelText('Code')).toHaveFocus();
    await user.keyboard('abcd2345');
    expect(screen.getByLabelText('Code')).toHaveValue('ABCD2345');
    await user.tab(); // submit
    await user.tab(); // resend
    expect(screen.getByRole('button', { name: 'Send a new code' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText(codeCase.resent)).toBeInTheDocument();
    expect(screen.getAllByText(codeCase.resent)).toHaveLength(1);
    expect(resends).toBe(1);
  });
});

describe('keyboard only registration choice', () => {
  it('the radio cards are reachable and selectable with the keyboard', async () => {
    const user = userEvent.setup();
    renderApp('/register');
    const farmer = await screen.findByRole('radio', { name: /I am a farmer/ });
    farmer.focus();
    await user.keyboard(' ');
    expect(farmer).toBeChecked();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: /I am a buyer/ })).toBeChecked();
  });
});
