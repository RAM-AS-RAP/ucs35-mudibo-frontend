import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl } from '@/test/msw/handlers';
import { logout, renderApp } from '@/test/render';
import { getSession } from '@/auth/session';
import { getHealth } from '@/api/endpoints';

afterEach(() => logout());

describe('DevRoleSwitcher (development only)', () => {
  it('previews a role with a fake session that never sends an Authorization header', async () => {
    const { router } = renderApp('/login');
    await userEvent.click(await screen.findByText('Dev: role preview'));
    await userEvent.click(screen.getByRole('button', { name: 'Farmer' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer'));
    expect(getSession()).toMatchObject({ role: 'farmer', isDevFake: true, accessToken: null });
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);

    /** @type {string | null | undefined} */
    let authorization;
    server.use(
      http.get(apiUrl('/api/v1/health'), ({ request }) => {
        authorization = request.headers.get('Authorization');
        return HttpResponse.json({ status: 'ok' });
      }),
    );
    await getHealth();
    expect(authorization).toBeNull();
  });

  it('previews the super admin with the Invites item', async () => {
    renderApp('/login');
    await userEvent.click(await screen.findByText('Dev: role preview'));
    await userEvent.click(screen.getByRole('button', { name: 'Super admin' }));
    expect(await screen.findAllByRole('link', { name: 'Invites' })).not.toHaveLength(0);
  });
});
