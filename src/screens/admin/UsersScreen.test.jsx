import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { server } from '@/test/msw/server';
import { adminUsersResponse, apiUrl, errorResponse, toggledUser } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { recordAll } from '@/test/buyer';
import { renderAdmin, rowOf, setWideScreen, waitForScreen } from '@/test/admin';
import { queryClient } from '@/lib/queryClient';

vi.mock('sonner', async (importOriginal) => {
  const actual = /** @type {typeof import('sonner')} */ (await importOriginal());
  return { ...actual, toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) };
});

/** @type {ReturnType<typeof recordAll>} */
let recorder;
beforeEach(() => {
  recorder = recordAll();
});
afterEach(() => {
  recorder.stop();
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const [amina, brian, wanjiku, otieno, chebet] = fixtures.adminUsersPage.items;
const listRequests = () => recorder.of('GET', '/api/v1/admin/users').map((r) => r.query);

/** @param {string} [path] @param {{ superAdmin?: boolean }} [options] */
async function openUsers(path = '/admin/users', options) {
  const utils = renderAdmin(path, options);
  await waitForScreen('Users', 'Loading users…');
  return utils;
}

/** The action buttons of a row, by their accessible names. @param {string} id */
const actionsOf = (id) =>
  within(rowOf(id))
    .queryAllByRole('button')
    .map((b) => b.getAttribute('aria-label'));

describe('UsersScreen', () => {
  it('lists the users with role, contact, status, activity and creation', async () => {
    await openUsers();
    expect(screen.getByTestId('list-count')).toHaveTextContent('Showing 5 of 5');
    expect(rowOf(amina.id)).toHaveTextContent('Main admin');
    expect(rowOf(wanjiku.id)).toHaveTextContent('254712345678');
    expect(rowOf(wanjiku.id)).toHaveTextContent('No email');
    expect(rowOf(wanjiku.id)).toHaveTextContent('3 listings');
    expect(rowOf(otieno.id)).toHaveTextContent('2 orders');
    expect(rowOf(otieno.id)).toHaveTextContent('Disabled');
    expect(rowOf(otieno.id)).toHaveTextContent('Since 10 Oct 2026, 12:30, by Amina Main');
    expect(rowOf(brian.id)).toHaveTextContent('by Amina Main');
    expect(rowOf(wanjiku.id)).toHaveTextContent('Registered themselves');
    expect(rowOf(chebet.id)).toHaveTextContent('Must set a new password');
  });

  it('explains passwords and has no password field anywhere', async () => {
    const { container } = await openUsers();
    expect(screen.getByTestId('password-note')).toHaveTextContent(
      'Administrators cannot set or view passwords.',
    );
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it('maps the role and status chips to the request parameters and the URL', async () => {
    const user = userEvent.setup();
    const { router } = await openUsers();
    expect(listRequests()[0]).toEqual({ limit: '20', offset: '0' });
    await user.click(screen.getByRole('radio', { name: 'Farmers' }));
    await waitFor(() =>
      expect(listRequests().at(-1)).toEqual({ role: 'farmer', limit: '20', offset: '0' }),
    );
    await user.click(screen.getByRole('radio', { name: 'Disabled' }));
    await waitFor(() =>
      expect(listRequests().at(-1)).toEqual({
        role: 'farmer',
        is_disabled: 'true',
        limit: '20',
        offset: '0',
      }),
    );
    await user.click(screen.getByRole('radio', { name: 'Active' }));
    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ is_disabled: 'false' }));
    expect(router.state.location.search).toBe('?role=farmer&status=active');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('operates the chips with the keyboard (Tab to the group, arrows to choose)', async () => {
    const user = userEvent.setup();
    await openUsers();
    const all = within(screen.getByRole('group', { name: 'Role' })).getByRole('radio', {
      name: 'All',
    });
    all.focus();
    await user.keyboard('{ArrowRight}');
    const farmers = within(screen.getByRole('group', { name: 'Role' })).getByRole('radio', {
      name: 'Farmers',
    });
    expect(farmers).toBeChecked();
    expect(farmers).toHaveFocus();
    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ role: 'farmer' }));
  });

  it('reads valid filters from the URL and removes invalid ones', async () => {
    const { router } = await openUsers('/admin/users?role=admin&status=bogus&q=x');
    await waitFor(() => expect(router.state.location.search).toBe('?role=admin'));
    expect(listRequests().every((q) => q.role === 'admin' && !('q' in q))).toBe(true);
  });

  it('searches 400 ms after typing, never below 2 characters', async () => {
    const user = userEvent.setup();
    await openUsers();
    const input = screen.getByLabelText('Search by name, email or phone');
    await user.type(input, 'o');
    await new Promise((r) => setTimeout(r, 600));
    expect(listRequests().some((q) => 'q' in q)).toBe(false);
    expect(screen.getByText('Type at least 2 characters to search.')).toBeInTheDocument();
    await user.type(input, 't');
    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ q: 'ot' }));
    expect(listRequests().filter((q) => 'q' in q)).toHaveLength(1);
  });

  it('offers Disable or Enable to the main administrator for everyone but the main administrator', async () => {
    await openUsers();
    expect(actionsOf(amina.id)).toEqual([]);
    expect(actionsOf(brian.id)).toEqual(['Disable Brian Admin']);
    expect(actionsOf(wanjiku.id)).toEqual(['Disable Wanjiku Kamau']);
    expect(actionsOf(otieno.id)).toEqual(['Enable Otieno Buyer']);
  });

  it('offers an ordinary administrator actions on farmers and buyers only (not on admins or self)', async () => {
    await openUsers('/admin/users', { superAdmin: false });
    expect(actionsOf(amina.id)).toEqual([]);
    expect(actionsOf(brian.id)).toEqual([]);
    expect(actionsOf(wanjiku.id)).toEqual(['Disable Wanjiku Kamau']);
    expect(actionsOf(otieno.id)).toEqual(['Enable Otieno Buyer']);
  });

  it('has the same actions in the table and in the stacked cards', async () => {
    setWideScreen(true);
    const wide = await openUsers();
    expect(screen.getByRole('table', { name: 'Users' })).toBeInTheDocument();
    const tableActions = screen
      .getAllByRole('button', { name: /^(Disable|Enable) / })
      .map((b) => b.getAttribute('aria-label'));
    wide.unmount();
    vi.restoreAllMocks();
    setWideScreen(false);
    await openUsers();
    expect(screen.queryByRole('table')).toBeNull();
    const cardActions = screen
      .getAllByRole('button', { name: /^(Disable|Enable) / })
      .map((b) => b.getAttribute('aria-label'));
    expect(cardActions).toEqual(tableActions);
  });

  it('disables after a confirmation, returns focus and refreshes the list', async () => {
    const user = userEvent.setup();
    // A server that remembers the change, as the backend does.
    const users = structuredClone(fixtures.adminUsersPage.items);
    server.use(
      http.get(apiUrl('/api/v1/admin/users'), ({ request }) =>
        HttpResponse.json(adminUsersResponse(users, new URL(request.url))),
      ),
      http.patch(apiUrl('/api/v1/admin/users/:id/disable'), ({ params }) => {
        const index = users.findIndex((u) => u.id === params.id);
        users[index] = toggledUser(users[index], true);
        return HttpResponse.json(users[index]);
      }),
    );
    await openUsers();
    const button = within(rowOf(wanjiku.id)).getByRole('button', { name: 'Disable Wanjiku Kamau' });
    await user.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Disable Wanjiku Kamau?' });
    expect(dialog).toHaveTextContent(
      'They are signed out on their next request and cannot sign in until you enable the account. Their listings are hidden from buyers. Nothing is deleted.',
    );
    const before = listRequests().length;
    await user.click(within(dialog).getByRole('button', { name: 'Disable account' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(recorder.of('PATCH', `/api/v1/admin/users/${wanjiku.id}/disable`)).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith('Wanjiku Kamau is disabled.');
    await waitFor(() => expect(listRequests().length).toBeGreaterThan(before));
    await waitFor(() => expect(rowOf(wanjiku.id)).toHaveTextContent('Disabled'));
    await waitFor(() =>
      expect(document.activeElement).toBe(within(rowOf(wanjiku.id)).getByRole('button')),
    );
  });

  it('enables with a plain confirmation', async () => {
    const user = userEvent.setup();
    await openUsers();
    await user.click(within(rowOf(otieno.id)).getByRole('button', { name: 'Enable Otieno Buyer' }));
    const dialog = screen.getByRole('dialog', { name: 'Enable Otieno Buyer?' });
    expect(dialog).toHaveTextContent('They can sign in again with their own password.');
    await user.click(within(dialog).getByRole('button', { name: 'Enable account' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Otieno Buyer is enabled again.'),
    );
    expect(recorder.of('PATCH', `/api/v1/admin/users/${otieno.id}/enable`)).toHaveLength(1);
  });

  it('accepts an idempotent answer (the user was already disabled)', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch(apiUrl('/api/v1/admin/users/:id/disable'), () =>
        HttpResponse.json(toggledUser(wanjiku, true)),
      ),
    );
    await openUsers();
    await user.click(
      within(rowOf(wanjiku.id)).getByRole('button', { name: 'Disable Wanjiku Kamau' }),
    );
    await user.click(screen.getByRole('button', { name: 'Disable account' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Wanjiku Kamau is disabled.'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(recorder.of('PATCH', `/api/v1/admin/users/${wanjiku.id}/disable`)).toHaveLength(1);
  });

  it.each([
    ['cannot_modify_super_admin', 'The main administrator account cannot be changed.'],
    ['cannot_disable_self', 'You cannot disable your own account.'],
    ['forbidden', 'Only the main administrator can change another administrator.'],
  ])('shows 403 %s in the dialog and refreshes the list', async (code, message) => {
    const user = userEvent.setup();
    server.use(
      http.patch(apiUrl('/api/v1/admin/users/:id/disable'), () =>
        errorResponse(403, code, { requestId: 'req-403' }),
      ),
    );
    await openUsers();
    await user.click(within(rowOf(brian.id)).getByRole('button', { name: 'Disable Brian Admin' }));
    const before = listRequests().length;
    await user.click(screen.getByRole('button', { name: 'Disable account' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(within(dialog).getByText('req-403')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Disable account' })).toBeNull();
    await waitFor(() => expect(listRequests().length).toBeGreaterThan(before));
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows 404 user_not_found and refreshes the list', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch(apiUrl('/api/v1/admin/users/:id/enable'), () =>
        errorResponse(404, 'user_not_found'),
      ),
    );
    await openUsers();
    await user.click(within(rowOf(otieno.id)).getByRole('button', { name: 'Enable Otieno Buyer' }));
    await user.click(screen.getByRole('button', { name: 'Enable account' }));
    expect(
      await screen.findByText('This user could not be found. The list has been refreshed.'),
    ).toBeInTheDocument();
  });

  it('after a network failure says the result is unknown and never resends', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.patch(apiUrl('/api/v1/admin/users/:id/disable'), () => {
        calls += 1;
        return HttpResponse.error();
      }),
    );
    await openUsers();
    await user.click(
      within(rowOf(wanjiku.id)).getByRole('button', { name: 'Disable Wanjiku Kamau' }),
    );
    await user.click(screen.getByRole('button', { name: 'Disable account' }));
    expect(
      await screen.findByText(
        'We could not confirm whether the change was saved. Refresh the list to check before trying again.',
      ),
    ).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toBe(1);
  });

  it('loads more with "Showing X of Y"', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...wanjiku,
      id: `a0000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`,
      name: `Farmer ${i}`,
    }));
    server.use(
      http.get(apiUrl('/api/v1/admin/users'), ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        return HttpResponse.json({
          items: many.slice(offset, offset + 20),
          total: 25,
          limit: 20,
          offset,
        });
      }),
    );
    await openUsers();
    expect(screen.getByTestId('list-count')).toHaveTextContent('Showing 20 of 25');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(screen.getByTestId('list-count')).toHaveTextContent('Showing 25 of 25'),
    );
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('shows the empty states', async () => {
    server.use(
      http.get(apiUrl('/api/v1/admin/users'), () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }),
      ),
    );
    await openUsers('/admin/users?role=buyer');
    expect(screen.getByText('No users match these filters')).toBeInTheDocument();
  });
});
