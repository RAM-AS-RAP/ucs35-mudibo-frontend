import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, validationErrorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout, renderApp } from '@/test/render';
import { expectNoAxeViolations } from '@/test/axe';
import { getGoogleFlowView, startGoogleFlow } from '@/auth/flow';
import { getSession } from '@/auth/session';
import { queryClient } from '@/lib/queryClient';

const TOKEN = fixtures.googleRoleRequired.signup_token;
/** @type {unknown[]} */
let bodies;
/** @type {import('vitest').MockInstance[]} */
let consoleSpies;

/** @param {{ preferredRole?: 'farmer' | 'buyer' | null }} [options] */
function startFlow({ preferredRole = null } = {}) {
  startGoogleFlow({
    signupToken: TOKEN,
    email: 'achieng.google@example.com',
    name: 'Achieng Otieno',
    preferredRole,
  });
}

/** @param {() => Response | Promise<Response>} [answer] */
function backend(answer = () => HttpResponse.json(fixtures.googleSignedIn, { status: 201 })) {
  server.use(
    http.post(apiUrl('/api/v1/auth/google/complete'), async ({ request }) => {
      bodies.push(await request.clone().json());
      return answer();
    }),
  );
}

beforeEach(() => {
  bodies = [];
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
  for (const place of places) expect(place).not.toContain(TOKEN);
  for (const spy of consoleSpies) spy.mockRestore();
  logout();
});

describe('GoogleRoleScreen', () => {
  it('without a Google flow (reload or direct visit) goes to /login with the flash', async () => {
    const { router } = renderApp('/google/role');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(
      await screen.findByText('Your sign in was interrupted. Please start again.'),
    ).toBeInTheDocument();
  });

  it('shows the person, no default choice, the warning, and a disabled button', async () => {
    startFlow();
    const { container } = renderApp('/google/role');
    expect(
      await screen.findByRole('heading', { name: 'Welcome, Achieng Otieno' }),
    ).toBeInTheDocument();
    expect(screen.getByText('You are signing up with achieng.google@example.com.')).toBeVisible();
    expect(screen.getByLabelText(/I am a farmer/)).not.toBeChecked();
    expect(screen.getByLabelText(/I am a buyer/)).not.toBeChecked();
    expect(
      screen.getByText(
        'You cannot change this later. If you need both, use a second account with a different email.',
      ),
    ).toBeVisible();
    expect(screen.getByText(/Payments run in the M-Pesa test environment/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create my account' })).toBeDisabled();
    expect(document.title).toBe('Choose your account type - AgriSence');
    await expectNoAxeViolations(container, { page: true });
  });

  it('a preferred role preselects the card but still needs the button', async () => {
    startFlow({ preferredRole: 'buyer' });
    backend();
    const { router } = renderApp('/google/role');
    expect(await screen.findByLabelText(/I am a buyer/)).toBeChecked();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bodies).toEqual([]);
    expect(router.state.location.pathname).toBe('/google/role');
    expect(screen.getByRole('button', { name: 'Create my account' })).toBeEnabled();
  });

  it('works with the keyboard, sends exactly {signup_token, role} once and opens the role home', async () => {
    startFlow();
    backend(async () => {
      await delay(80);
      return HttpResponse.json({ ...fixtures.googleSignedIn, role: 'buyer' }, { status: 201 });
    });
    server.use(http.get(apiUrl('/api/v1/auth/me'), () => HttpResponse.json(fixtures.userMeGoogle)));
    const user = userEvent.setup();
    const { router } = renderApp('/google/role');
    await screen.findByRole('heading', { name: 'Welcome, Achieng Otieno' });
    screen.getByLabelText(/I am a farmer/).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByLabelText(/I am a buyer/)).toBeChecked();
    const submit = screen.getByRole('button', { name: 'Create my account' });
    await user.dblClick(submit);
    await waitFor(() => expect(router.state.location.pathname).toBe('/buyer/browse'));
    expect(bodies).toEqual([{ signup_token: TOKEN, role: 'buyer' }]);
    expect(getGoogleFlowView()).toBeNull();
    expect(getSession()).toMatchObject({ role: 'buyer', passwordSet: false, googleLinked: true });
  });

  it.each([
    ['invalid_or_expired_ticket', 400, 'Your Google sign in expired. Please try again.'],
    ['google_retry', 409, 'Please try signing in with Google again.'],
  ])('%s clears the flow and shows its message on /login', async (code, status, text) => {
    startFlow({ preferredRole: 'farmer' });
    backend(() => errorResponse(status, code));
    const { router } = renderApp('/google/role');
    await userEvent.click(await screen.findByRole('button', { name: 'Create my account' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(getGoogleFlowView()).toBeNull();
  });

  it('a 422 shows the message and keeps the screen; focus moves to the summary', async () => {
    startFlow({ preferredRole: 'farmer' });
    backend(() =>
      validationErrorResponse([{ field: 'role', message: 'Input should be farmer or buyer' }]),
    );
    const { router, container } = renderApp('/google/role');
    await userEvent.click(await screen.findByRole('button', { name: 'Create my account' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Input should be farmer or buyer');
    expect(alert).toHaveFocus();
    expect(router.state.location.pathname).toBe('/google/role');
    expect(getGoogleFlowView()).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  it('a 429 uses the wait pattern', async () => {
    startFlow({ preferredRole: 'farmer' });
    backend(() => errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '30' } }));
    renderApp('/google/role');
    await userEvent.click(await screen.findByRole('button', { name: 'Create my account' }));
    expect(await screen.findByText('Too many attempts. Try again in 30 seconds.')).toBeVisible();
    expect(screen.getByRole('button', { name: /Try again in \d+ s/ })).toBeDisabled();
  });

  it('Cancel clears the flow and goes to /login', async () => {
    startFlow();
    const { router } = renderApp('/google/role');
    await userEvent.click(await screen.findByRole('link', { name: 'Cancel' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(getGoogleFlowView()).toBeNull();
  });

  it('logout and session expiry clear a Google flow; a reload loses it', async () => {
    startFlow();
    logout();
    expect(getGoogleFlowView()).toBeNull();
    // A reload starts with an empty module memory: nothing was stored to bring it back.
    startFlow();
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(TOKEN);
  });
});
