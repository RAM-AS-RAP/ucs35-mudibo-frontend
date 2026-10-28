import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, nextGoogleNonce } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout, renderApp } from '@/test/render';
import { expectNoAxeViolations } from '@/test/axe';
import {
  configureGoogle,
  installGoogleStub,
  removeGoogleStub,
  TEST_CREDENTIAL,
} from '@/test/googleStub';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { getGoogleFlowView } from '@/auth/flow';
import { getSession } from '@/auth/session';
import { queryClient } from '@/lib/queryClient';
import { resetGsiForTests } from '@/lib/google/loadGsi';

/** @type {ReturnType<typeof installGoogleStub>} */
let stub;
/** @type {string[]} */
let issued;
/** @type {unknown[]} */
let signInBodies;
/** @type {import('vitest').MockInstance[]} */
let consoleSpies;
/** Every secret a test saw (credential, nonces, signup token). */
let secrets;

/** Record the nonces and sign in bodies; answer with `answer` (default signed_in). */
function backend(answer = () => HttpResponse.json(fixtures.googleSignedIn)) {
  server.use(
    http.post(apiUrl('/api/v1/auth/google/nonce'), () => {
      const nonce = nextGoogleNonce();
      issued.push(nonce);
      return HttpResponse.json({ ...fixtures.googleNonce, nonce });
    }),
    http.post(apiUrl('/api/v1/auth/google'), async ({ request }) => {
      signInBodies.push(await request.clone().json());
      return answer();
    }),
  );
}

beforeEach(() => {
  issued = [];
  signInBodies = [];
  secrets = [TEST_CREDENTIAL, fixtures.googleRoleRequired.signup_token];
  configureGoogle();
  stub = installGoogleStub();
  consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m));
});

afterEach(() => {
  // Secrets: never in storage, the URL, history state, a query key or cache entry, or the console.
  secrets.push(...issued);
  const places = [
    JSON.stringify({ ...window.sessionStorage }),
    JSON.stringify({ ...window.localStorage }),
    window.location.href,
    JSON.stringify(window.history.state),
    JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((q) => [q.queryKey, q.state.data]),
    ),
    JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((m) => m.state.variables),
    ),
    ...consoleSpies.map((spy) => JSON.stringify(spy.mock.calls)),
  ];
  for (const secret of secrets) for (const place of places) expect(place).not.toContain(secret);
  for (const spy of consoleSpies) spy.mockRestore();
  expect(stub.prompt).not.toHaveBeenCalled();
  removeGoogleStub();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
  logout();
});

/** Render /login and wait for the rendered Google button. */
async function openLogin(path = '/login') {
  const utils = renderApp(path);
  await screen.findByTestId('google-button');
  return utils;
}

describe('Google button flow', () => {
  it('fetches the nonce before initialize, passes it on, and renders the documented button', async () => {
    backend();
    await openLogin();
    expect(issued).toHaveLength(1);
    expect(stub.initialize).toHaveBeenCalledTimes(1);
    expect(stub.lastNonce()).toBe(issued[0]);
    const [element, options] = stub.renderButton.mock.calls[0];
    expect(element).toBeInstanceOf(HTMLElement);
    expect(options).toMatchObject({
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      locale: 'en',
    });
    expect(typeof options.width).toBe('number');
    expect(options.width).toBeGreaterThanOrEqual(200);
    expect(options.width).toBeLessThanOrEqual(400);
    const group = screen.getByRole('group', { name: 'Or continue with Google' });
    expect(group).not.toHaveAttribute('aria-describedby');
  });

  it('sends exactly {credential, nonce} with the nonce given to initialize, and signs in', async () => {
    backend();
    server.use(
      http.get(apiUrl('/api/v1/auth/me'), () =>
        HttpResponse.json({ ...fixtures.userMe, google_linked: true }),
      ),
    );
    const { router } = await openLogin();
    const nonce = stub.lastNonce();
    act(() => stub.deliverCredential());
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
    expect(signInBodies).toEqual([{ credential: TEST_CREDENTIAL, nonce }]);
    expect(getSession()).toMatchObject({
      role: 'farmer',
      accessToken: fixtures.googleSignedIn.access_token,
      name: 'Wanjiku Kamau',
      googleLinked: true,
    });
  });

  it('shows progress in place of the button and disables the form while signing in', async () => {
    /** @type {() => void} */
    let releaseMe = () => {};
    const meAnswered = new Promise((resolve) => {
      releaseMe = () => resolve(undefined);
    });
    backend(() => HttpResponse.json({ ...fixtures.googleSignedIn, name: 'Wanjiku Kamau' }));
    server.use(
      http.get(apiUrl('/api/v1/auth/me'), async () => {
        await meAnswered;
        return HttpResponse.json(fixtures.userMe);
      }),
    );
    const { router } = await openLogin();
    const form = screen.getByRole('button', { name: 'Sign in' }).closest('form');
    expect(form).not.toHaveAttribute('inert');
    act(() => stub.deliverCredential());
    // Once the backend accepted Google's answer: a greeting, while the profile still loads.
    expect(
      await screen.findByText('Welcome back, Wanjiku Kamau. Opening your account…'),
    ).toBeInTheDocument();
    // Only the spinner is shown; the words are for screen readers.
    expect(screen.getByText('Welcome back, Wanjiku Kamau. Opening your account…')).toHaveClass(
      'sr-only',
    );
    expect(screen.queryByTestId('google-button')).not.toBeVisible();
    expect(form).toHaveAttribute('inert');
    expect(form).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('navigation', { name: 'Account pages', hidden: true })).toHaveAttribute(
      'inert',
    );
    releaseMe();
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
    await waitFor(() => expect(screen.queryByTestId('google-button')).not.toBeInTheDocument());
  });

  it('reassures the person when signing in takes longer than 8 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    /** @type {() => void} */
    let answer = () => {};
    const answered = new Promise((resolve) => {
      answer = () => resolve(undefined);
    });
    backend(async () => {
      await answered;
      return errorResponse(401, 'google_sign_in_failed');
    });
    const { container } = await openLogin();
    act(() => stub.deliverCredential());
    await screen.findByText('Signing you in with Google…');
    expect(screen.queryByText(/Still working/)).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(8_000));
    expect(await screen.findByText(/Still working\. Your connection seems slow/)).toHaveClass(
      'sr-only',
    );
    answer();
    await screen.findByRole('alert');
    // A failure gives the form back and removes the progress.
    expect(screen.queryByText(/Still working/)).not.toBeInTheDocument();
    expect(container.querySelector('form')).not.toHaveAttribute('inert');
  });

  it('honours the intended path and routes by role', async () => {
    backend(() => HttpResponse.json({ ...fixtures.googleSignedIn, role: 'buyer' }));
    server.use(
      http.get(apiUrl('/api/v1/auth/me'), () =>
        HttpResponse.json({ ...fixtures.userMe, role: 'buyer' }),
      ),
    );
    const { router } = renderApp('/buyer/orders');
    await screen.findByTestId('google-button');
    act(() => stub.deliverCredential());
    await waitFor(() => expect(router.state.location.pathname).toBe('/buyer/orders'));
  });

  it('ignores a second callback while the request runs and shows the status once', async () => {
    backend(async () => {
      await delay(150);
      return errorResponse(401, 'google_sign_in_failed');
    });
    await openLogin();
    act(() => {
      stub.deliverCredential();
      stub.deliverCredential('another-id-token-from-google-02');
    });
    expect(await screen.findByText('Signing you in with Google…')).toBeInTheDocument();
    expect(
      screen.getByText('Signing you in with Google…').closest('[role="status"]'),
    ).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByTestId('google-button')).not.toBeVisible();
    expect(
      await screen.findByText(
        'Google sign in did not work. Please try again or use your email and password.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Google sign in did not work.');
    expect(signInBodies).toHaveLength(1);
  });

  it('fetches a new nonce and initialises again after a failure', async () => {
    backend(() => errorResponse(401, 'google_sign_in_failed'));
    await openLogin();
    act(() => stub.deliverCredential());
    await screen.findByRole('alert');
    await waitFor(() => expect(stub.initialize).toHaveBeenCalledTimes(2));
    expect(issued).toHaveLength(2);
    expect(issued[1]).not.toBe(issued[0]);
    expect(stub.lastNonce()).toBe(issued[1]);
    expect(stub.renderButton).toHaveBeenCalledTimes(2);
    // The new nonce is the one sent next.
    act(() => stub.deliverCredential());
    await waitFor(() => expect(signInBodies).toHaveLength(2));
    expect(signInBodies[1]).toEqual({ credential: TEST_CREDENTIAL, nonce: issued[1] });
  });

  it('a 401 from Google sign in never clears a session (public route, no Authorization)', async () => {
    /** @type {string | null} */
    let authorization = 'unset';
    backend(() => errorResponse(401, 'google_sign_in_failed'));
    server.use(
      http.post(apiUrl('/api/v1/auth/google/nonce'), ({ request }) => {
        authorization = request.headers.get('Authorization');
        const nonce = nextGoogleNonce();
        issued.push(nonce);
        return HttpResponse.json({ ...fixtures.googleNonce, nonce });
      }),
    );
    const { router } = await openLogin();
    act(() => stub.deliverCredential());
    await screen.findByRole('alert');
    expect(authorization).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
  });

  it.each([
    ['google_not_allowed', 403, 'Administrator accounts sign in with email and password.'],
    [
      'google_conflict',
      409,
      'A different Google account is already connected to this email. Use that Google account, or sign in with your email and password.',
    ],
  ])('%s shows its message and sends nothing more by itself', async (code, status, text) => {
    backend(() => errorResponse(status, code));
    await openLogin();
    act(() => stub.deliverCredential());
    expect(await screen.findByText(text)).toBeInTheDocument();
    await waitFor(() => expect(issued).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(signInBodies).toHaveLength(1);
    expect(issued).toHaveLength(2);
  });

  it('503 google_unavailable hides the button for the rest of the visit', async () => {
    backend(() => errorResponse(503, 'google_unavailable', { headers: { 'Retry-After': '5' } }));
    const { container } = await openLogin();
    act(() => stub.deliverCredential());
    expect(
      await screen.findByText(
        'Google sign in is not available right now. Use your email and password.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('google-button')).not.toBeInTheDocument();
    expect(issued).toHaveLength(1);
    await expectNoAxeViolations(container);
  });

  it('503 from the nonce hides the button without loading anything else', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/google/nonce'), () =>
        errorResponse(503, 'google_unavailable'),
      ),
    );
    renderApp('/login');
    expect(
      await screen.findByText(
        'Google sign in is not available right now. Use your email and password.',
      ),
    ).toBeInTheDocument();
    expect(stub.initialize).not.toHaveBeenCalled();
    expect(screen.queryByTestId('google-button')).not.toBeInTheDocument();
  });

  it('429 uses the wait pattern: a countdown on Try again, then a new nonce', async () => {
    backend(() => errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '2' } }));
    await openLogin();
    act(() => stub.deliverCredential());
    expect(
      await screen.findByText('Too many attempts. Try again in 2 seconds.'),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Try again in \d s/ });
    expect(button).toBeDisabled();
    expect(screen.queryByTestId('google-button')).not.toBeVisible();
    const tryAgain = await screen.findByRole('button', { name: 'Try again' }, { timeout: 4000 });
    expect(issued).toHaveLength(1);
    await userEvent.click(tryAgain);
    await waitFor(() => expect(issued).toHaveLength(2));
    expect(await screen.findByTestId('google-button')).toBeVisible();
  });

  it('a long 429 wait is shown approximately', async () => {
    backend(() => errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '600' } }));
    await openLogin();
    act(() => stub.deliverCredential());
    expect(
      await screen.findByText('Too many attempts. Try again in about 10 minutes.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
  });

  it.each([
    ['network_error', () => HttpResponse.error(), /internet connection/],
    ['timeout', () => errorResponse(504, 'timeout'), /took too long/],
  ])(
    '%s shows the F0 message and allows another attempt with a new nonce',
    async (_c, answer, text) => {
      backend(answer);
      await openLogin();
      act(() => stub.deliverCredential());
      expect(await screen.findByText(text)).toBeInTheDocument();
      await waitFor(() => expect(issued).toHaveLength(2));
      expect(await screen.findByTestId('google-button')).toBeVisible();
    },
  );

  it('a nonce that cannot be fetched offers Try again', async () => {
    let fail = true;
    server.use(
      http.post(apiUrl('/api/v1/auth/google/nonce'), () => {
        if (fail) return HttpResponse.error();
        const nonce = nextGoogleNonce();
        issued.push(nonce);
        return HttpResponse.json({ ...fixtures.googleNonce, nonce });
      }),
    );
    const { container } = renderApp('/login');
    expect(await screen.findByText(/internet connection/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('google-button')).toBeVisible();
    expect(stub.lastNonce()).toBe(issued[0]);
  });

  it('role_required starts the Google flow and opens /google/role with only {from}', async () => {
    backend(() => HttpResponse.json(fixtures.googleRoleRequired));
    const { router } = renderApp('/farmer/prices');
    await screen.findByTestId('google-button');
    act(() => stub.deliverCredential());
    await waitFor(() => expect(router.state.location.pathname).toBe('/google/role'));
    expect(router.state.location.state).toEqual({ from: '/farmer/prices' });
    expect(getGoogleFlowView()).toEqual({
      kind: 'google',
      email: 'achieng.google@example.com',
      name: 'Achieng Otieno',
      preferredRole: null,
    });
    expect(getSession()).toBeNull();
    expect(window.sessionStorage.getItem('agrisence.session')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Welcome, Achieng Otieno' })).toHaveFocus();
  });

  it('never calls prompt (One Tap)', async () => {
    backend();
    await openLogin();
    expect(stub.prompt).not.toHaveBeenCalled();
  });
});

describe('nonce refresh', () => {
  it('replaces the nonce before it expires and clears the timer on unmount', async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'performance'],
    });
    backend();
    const { unmount } = await openLogin();
    expect(issued).toHaveLength(1);
    // expires_in 300: refreshed after 240 seconds, not before.
    await act(async () => vi.advanceTimersByTime(239_000));
    expect(issued).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(1_000));
    await waitFor(() => expect(issued).toHaveLength(2));
    await waitFor(() => expect(stub.lastNonce()).toBe(issued[1]));
    unmount();
    // The refresh timer was cleared: nothing more is fetched.
    await act(async () => vi.advanceTimersByTime(600_000));
    expect(issued).toHaveLength(2);
  });

  it('refreshes at least 30 seconds out for a short expires_in', async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'performance'],
    });
    server.use(
      http.post(apiUrl('/api/v1/auth/google/nonce'), () => {
        const nonce = nextGoogleNonce();
        issued.push(nonce);
        return HttpResponse.json({ nonce, expires_in: 45 });
      }),
    );
    await openLogin();
    await act(async () => vi.advanceTimersByTime(29_000));
    expect(issued).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(1_000));
    await waitFor(() => expect(issued).toHaveLength(2));
  });

  it('refreshes on becoming visible after the deadline (performance.now, not Date)', async () => {
    backend();
    await openLogin();
    const start = performance.now();
    const now = vi.spyOn(performance, 'now');
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    now.mockReturnValue(start + 100_000);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(issued).toHaveLength(1);
    now.mockReturnValue(start + 241_000);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(issued).toHaveLength(2));
    visibility.mockRestore();
  });
});

describe('StrictMode, the loader and the offline state', () => {
  it('a StrictMode double mount gives one initialisation and no leaked timers', async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'performance'],
    });
    backend();
    const router = createMemoryRouter(
      [{ path: '*', element: <GoogleSignInButton context="login" /> }],
      { initialEntries: ['/login'] },
    );
    const { unmount } = render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>,
    );
    await screen.findByTestId('google-button');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(issued).toHaveLength(1);
    expect(stub.initialize).toHaveBeenCalledTimes(1);
    // One refresh timer only: one new nonce at the deadline.
    await act(async () => vi.advanceTimersByTime(240_000));
    await waitFor(() => expect(issued).toHaveLength(2));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(issued).toHaveLength(2);
    expect(stub.initialize).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => vi.advanceTimersByTime(600_000));
    expect(issued).toHaveLength(2);
  });

  it('after a success on the same page, a new nonce is fetched before the button returns', async () => {
    backend();
    const router = createMemoryRouter(
      [{ path: '*', element: <GoogleSignInButton context="login" /> }],
      { initialEntries: ['/login'] },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByTestId('google-button');
    act(() => stub.deliverCredential());
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
    await waitFor(() => expect(stub.initialize).toHaveBeenCalledTimes(2));
    expect(issued).toHaveLength(2);
    expect(stub.lastNonce()).toBe(issued[1]);
  });

  it('a script that fails to load shows the fallback, and Try again loads it', async () => {
    removeGoogleStub();
    configureGoogle();
    backend();
    const { container } = renderApp('/login');
    const tag = await waitFor(() => {
      const found = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (!found) throw new Error('no tag yet');
      return found;
    });
    act(() => tag.dispatchEvent(new Event('error')));
    expect(
      await screen.findByText(
        'Google sign in could not be loaded. Check your connection or ad blocker, or use your email and password.',
      ),
    ).toBeInTheDocument();
    expect(issued).toHaveLength(0);
    await expectNoAxeViolations(container);
    stub = installGoogleStub();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('google-button')).toBeVisible();
    expect(issued).toHaveLength(1);
    resetGsiForTests();
  });

  it('offline shows the offline message and does not load the script', async () => {
    removeGoogleStub();
    configureGoogle();
    backend();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderApp('/login');
    const group = await screen.findByRole('group', { name: 'Or continue with Google' });
    expect(within(group).getByText(/You are offline/)).toBeInTheDocument();
    expect(document.querySelector('script[src*="gsi"]')).toBeNull();
    expect(issued).toHaveLength(0);
  });
});

describe('configuration', () => {
  it.each([[''], ['not-a-client-id'], ['abc.apps.googleusercontent.com.example']])(
    'with %j there is no Google UI, script or request on login and register',
    async (value) => {
      removeGoogleStub();
      vi.stubEnv('VITE_GOOGLE_CLIENT_ID', value);
      let requests = 0;
      server.use(
        http.post(apiUrl('/api/v1/auth/google/nonce'), () => {
          requests += 1;
          return HttpResponse.json(fixtures.googleNonce);
        }),
      );
      const { unmount } = renderApp('/login');
      await screen.findByRole('heading', { name: 'Sign in' });
      expect(screen.queryByText('Or continue with Google')).not.toBeInTheDocument();
      unmount();
      renderApp('/register');
      await screen.findByRole('heading', { name: 'Create an account' });
      expect(screen.queryByText('Or continue with Google')).not.toBeInTheDocument();
      expect(document.querySelector('script[src*="google"]')).toBeNull();
      expect(requests).toBe(0);
    },
  );

  it('on register the group passes the chosen card on', async () => {
    backend(() => HttpResponse.json(fixtures.googleRoleRequired));
    const { container, router } = renderApp('/register');
    const group = await screen.findByRole('group', { name: 'Or continue with Google' });
    expect(group).not.toHaveAttribute('aria-describedby');
    await screen.findByTestId('google-button');
    await expectNoAxeViolations(container);
    await userEvent.click(screen.getByLabelText(/I am a buyer/));
    act(() => stub.deliverCredential());
    await waitFor(() => expect(router.state.location.pathname).toBe('/google/role'));
    expect(getGoogleFlowView()?.preferredRole).toBe('buyer');
  });

  it('the login group passes axe while loading and when rendered', async () => {
    let release = () => {};
    server.use(
      http.post(apiUrl('/api/v1/auth/google/nonce'), async () => {
        await new Promise((resolve) => {
          release = () => resolve(undefined);
        });
        const nonce = nextGoogleNonce();
        issued.push(nonce);
        return HttpResponse.json({ ...fixtures.googleNonce, nonce });
      }),
    );
    const { container } = renderApp('/login');
    expect(await screen.findByText('Loading Google sign in…')).toBeInTheDocument();
    await expectNoAxeViolations(container);
    release();
    await screen.findByTestId('google-button');
    await expectNoAxeViolations(container);
  });
});
