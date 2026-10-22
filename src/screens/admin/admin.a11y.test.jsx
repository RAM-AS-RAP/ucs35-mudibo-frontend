// Accessibility of the administrator screens (F4) in every state: loading, empty, error, success
// and with each dialog open. Also: no broken values ("undefined", "NaN", "null") on screen, and
// the navigation's review count badge.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { expectNoAxeViolations } from '@/test/axe';
import { logout } from '@/test/render';
import { renderAdmin, rowOf, setWideScreen } from '@/test/admin';
import { BROKEN_VALUE_PATTERNS, collectUserFacingStrings } from '@/test/userFacing';
import { queryClient } from '@/lib/queryClient';

vi.mock('sonner', async (importOriginal) => {
  const actual = /** @type {typeof import('sonner')} */ (await importOriginal());
  return { ...actual, toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) };
});

afterEach(() => {
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

/** @param {Element} root */
function expectNoBrokenValues(root) {
  const strings = collectUserFacingStrings(root);
  for (const pattern of BROKEN_VALUE_PATTERNS) {
    expect(strings.filter((s) => pattern.test(s))).toEqual([]);
  }
}

/** Wait for the row or card of an item. @param {string} id */
const findRow = (id) =>
  waitFor(
    () => {
      const row = rowOf(id);
      expect(row).not.toBeNull();
      return row;
    },
    { timeout: 5000 },
  );

/** Check the whole page (dialogs render in a portal under body). */
async function check() {
  expectNoBrokenValues(document.body);
  await expectNoAxeViolations(document.body, { page: true });
}

/**
 * Screen, path, list endpoint (or null), heading, empty title.
 * @type {Array<[string, string, string, string, string | null]>}
 */
const SCREENS = [
  ['dashboard', '/admin', '/api/v1/admin/stats', 'Dashboard', null],
  ['users', '/admin/users', '/api/v1/admin/users', 'Users', 'No users yet'],
  ['invites', '/admin/invites', '/api/v1/admin/invites', 'Invites', 'No invitations yet'],
  ['listings', '/admin/listings', '/api/v1/admin/listings', 'Listings', 'No listings yet'],
  ['orders', '/admin/orders', '/api/v1/admin/orders', 'Orders', 'No orders yet'],
  ['payments', '/admin/payments', '/api/v1/admin/payments', 'Payments', 'No payments yet'],
  [
    'accuracy',
    '/admin/forecast-accuracy',
    '/api/v1/admin/forecast-accuracy',
    'Forecast accuracy',
    'No forecasts to compare yet',
  ],
];

const EMPTY_PAGE = { items: [], total: 0, limit: 20, offset: 0 };

describe.each(SCREENS)('%s screen', (_name, path, endpoint, heading, emptyTitle) => {
  it('loading state', async () => {
    server.use(
      http.get(apiUrl(endpoint), async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    renderAdmin(path);
    await screen.findByRole('heading', { name: heading, level: 1 }, { timeout: 5000 });
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    await check();
  });

  it('success state (cards and table)', async () => {
    for (const wide of [false, true]) {
      setWideScreen(wide);
      const { unmount } = renderAdmin(path);
      await screen.findByRole('heading', { name: heading, level: 1 }, { timeout: 5000 });
      await waitFor(
        () =>
          expect(document.querySelector('[role="status"][aria-live="polite"] .sr-only')).toBeNull(),
        { timeout: 5000 },
      );
      await check();
      unmount();
      vi.restoreAllMocks();
      queryClient.clear();
    }
  });

  it('error state with the reference', async () => {
    server.use(
      http.get(apiUrl(endpoint), () =>
        errorResponse(500, 'internal_error', { requestId: 'req-a11y' }),
      ),
    );
    renderAdmin(path);
    expect(await screen.findByText('req-a11y', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    await check();
  });

  if (emptyTitle) {
    it('empty state', async () => {
      const empty = endpoint.endsWith('forecast-accuracy')
        ? { ...EMPTY_PAGE, summary: [], note: '' }
        : EMPTY_PAGE;
      server.use(http.get(apiUrl(endpoint), () => HttpResponse.json(empty)));
      renderAdmin(path);
      expect(await screen.findByText(emptyTitle, {}, { timeout: 5000 })).toBeInTheDocument();
      await check();
    });
  }
});

describe('order detail screen', () => {
  const REVIEW = fixtures.adminOrderDetail;
  const open = async () => {
    renderAdmin(`/admin/orders/${REVIEW.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Order AGR-R3V13W' }, { timeout: 5000 });
  };

  it('success state with the review panel', async () => {
    await open();
    await check();
  });

  it('loading, error and not found states', async () => {
    server.use(
      http.get(apiUrl('/api/v1/admin/orders/:id'), async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    const loading = renderAdmin(`/admin/orders/${REVIEW.id}`);
    expect(
      await screen.findByText('Loading the order…', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    await check();
    loading.unmount();
    queryClient.clear();
    server.use(
      http.get(apiUrl('/api/v1/admin/orders/:id'), () => errorResponse(500, 'internal_error')),
    );
    const failed = renderAdmin(`/admin/orders/${REVIEW.id}`);
    expect(
      await screen.findByText('The order could not be loaded', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    await check();
    failed.unmount();
    queryClient.clear();
    server.use(
      http.get(apiUrl('/api/v1/admin/orders/:id'), () => errorResponse(404, 'order_not_found')),
    );
    renderAdmin(`/admin/orders/${REVIEW.id}`);
    expect(
      await screen.findByText('This order could not be found.', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    await check();
  });

  it.each(['Confirm sale', 'Void order'])(
    'with the "%s" dialog open, also with a note error',
    async (button) => {
      const user = userEvent.setup();
      await open();
      await user.click(screen.getByRole('button', { name: button }));
      await check();
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: button }));
      expect(screen.getByText('Write at least 10 characters.')).toBeInTheDocument();
      await check();
    },
  );

  it('with a server error in the dialog', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/api/v1/admin/orders/:id/resolve'), () =>
        errorResponse(409, 'insufficient_stock_to_confirm'),
      ),
    );
    await open();
    await user.click(screen.getByRole('button', { name: 'Confirm sale' }));
    await user.type(screen.getByLabelText('Note'), 'Checked the statement.');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm sale' }),
    );
    await screen.findByTestId('dialog-error');
    await check();
  });

  it('with the events dialog open', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getAllByRole('button', { name: /^View events/ })[0]);
    await within(await screen.findByRole('dialog')).findByText('stk_push_request');
    await check();
  });
});

describe('dialogs on the list screens', () => {
  it('users: disable dialog', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/users');
    const row = await findRow(fixtures.adminUsersPage.items[2].id);
    await user.click(within(row).getByRole('button'));
    await screen.findByRole('dialog');
    await check();
  });

  it('invites: form dialog with errors, revoke dialog and the result panel', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/invites');
    await screen.findByRole('heading', { name: 'Invites', level: 1 }, { timeout: 5000 });
    await waitFor(() => expect(rowOf(fixtures.adminInvitesPage.items[0].id)).not.toBeNull(), {
      timeout: 5000,
    });
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    const dialog = screen.getByRole('dialog');
    await check();
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    expect(await within(dialog).findByText('Enter your email address.')).toBeInTheDocument();
    await check();
    await user.type(within(dialog).getByLabelText('Full name'), 'New Admin');
    await user.type(within(dialog).getByLabelText('Phone number'), '0712345678');
    await user.type(within(dialog).getByLabelText('Email'), 'new@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    await screen.findByTestId('invite-result');
    await check();
    await user.click(screen.getByRole('button', { name: 'Revoke Pending Person' }));
    await screen.findByRole('dialog');
    await check();
  });

  it('listings: remove dialog with the 409 message', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete(apiUrl('/api/v1/admin/listings/:id'), () =>
        errorResponse(409, 'listing_has_open_payments'),
      ),
    );
    renderAdmin('/admin/listings');
    const row = await findRow(fixtures.adminListingsPage.items[0].id);
    await user.click(within(row).getByRole('button'));
    await check();
    await user.click(screen.getByRole('button', { name: 'Remove listing' }));
    await screen.findByTestId('dialog-error');
    await check();
  });
});

describe('navigation badge', () => {
  it('names the orders that need review in the Orders link', async () => {
    renderAdmin('/admin/users');
    const nav = await screen.findByRole(
      'navigation',
      { name: 'Main navigation' },
      { timeout: 5000 },
    );
    const link = await within(nav).findByRole('link', { name: /Orders.*1 order needs review/ });
    expect(within(link).getByTestId('nav-count-badge')).toHaveTextContent('1');
    expect(within(link).getByTestId('nav-count-badge')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows no badge when the count request fails', async () => {
    server.use(
      http.get(apiUrl('/api/v1/admin/orders'), ({ request }) =>
        new URL(request.url).searchParams.get('limit') === '1'
          ? errorResponse(500, 'internal_error')
          : HttpResponse.json(fixtures.adminOrdersPage),
      ),
    );
    renderAdmin('/admin/users');
    const nav = await screen.findByRole(
      'navigation',
      { name: 'Main navigation' },
      { timeout: 5000 },
    );
    await screen.findByRole('heading', { name: 'Users', level: 1 });
    await new Promise((r) => setTimeout(r, 100));
    expect(within(nav).queryByTestId('nav-count-badge')).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Orders' })).toBeInTheDocument();
  });
});
