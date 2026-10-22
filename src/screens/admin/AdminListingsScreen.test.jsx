import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { recordAll } from '@/test/buyer';
import { renderAdmin, rowOf, waitForScreen } from '@/test/admin';
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

const [active, unsafe, removed, disabledFarmer] = fixtures.adminListingsPage.items;
const listRequests = () => recorder.of('GET', '/api/v1/admin/listings').map((r) => r.query);

async function openListings(path = '/admin/listings') {
  const utils = renderAdmin(path);
  await waitForScreen('Listings', 'Loading listings…');
  return utils;
}

describe('AdminListingsScreen', () => {
  it('shows each listing with its farmer, orders and status', async () => {
    await openListings();
    expect(screen.getByTestId('list-count')).toHaveTextContent('Showing 4 of 4');
    const row = rowOf(active.id);
    expect(row).toHaveTextContent('Maize, Nairobi');
    expect(row).toHaveTextContent('120.5 kg');
    expect(row).toHaveTextContent('KES 45.50 per kg');
    expect(row).toHaveTextContent('Wanjiku Kamau');
    expect(row).toHaveTextContent('1 waiting for payment, 2 paid');
    expect(rowOf(removed.id)).toHaveTextContent('Removed 15 Oct 2026, 15:00 by Amina Main');
    expect(within(rowOf(disabledFarmer.id)).getByTestId('farmer-disabled')).toHaveTextContent(
      'Farmer disabled',
    );
    expect(within(rowOf(active.id)).queryByTestId('farmer-disabled')).toBeNull();
  });

  it('renders photos only through safeImageUrl', async () => {
    await openListings();
    const img = within(rowOf(active.id)).getByRole('img', { name: 'Maize in Nairobi' });
    expect(img).toHaveAttribute('src', 'https://images.agrisence.test/listings/a.jpg');
    expect(within(rowOf(unsafe.id)).queryByRole('img')).toBeNull();
    expect(within(rowOf(unsafe.id)).getByTestId('produce-photo-placeholder')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('javascript:');
  });

  it('offers Remove except for removed listings', async () => {
    await openListings();
    expect(
      within(rowOf(active.id)).getByRole('button', {
        name: 'Remove Maize in Nairobi by Wanjiku Kamau',
      }),
    ).toBeInTheDocument();
    expect(within(rowOf(removed.id)).queryByRole('button')).toBeNull();
  });

  it('maps the filters to the request and the URL', async () => {
    const user = userEvent.setup();
    const { router } = await openListings();
    await user.click(screen.getByRole('radio', { name: 'Sold out' }));
    await user.click(screen.getByRole('radio', { name: 'Beans' }));
    await waitFor(() =>
      expect(within(screen.getByLabelText('Market')).getAllByRole('option')).toHaveLength(3),
    );
    await user.selectOptions(screen.getByLabelText('Market'), 'Kisumu');
    await user.type(screen.getByLabelText('Search by farmer'), 'Wa');
    await waitFor(() =>
      expect(listRequests().at(-1)).toEqual({
        status: 'sold_out',
        crop: 'beans',
        market: 'Kisumu',
        q: 'Wa',
        limit: '20',
        offset: '0',
      }),
    );
    expect(router.state.location.search).toBe('?status=sold_out&crop=beans&market=Kisumu&q=Wa');
    expect(recorder.of('GET', '/api/v1/markets')).toHaveLength(1);
  });

  it('drops a market from the URL that GET /markets does not list', async () => {
    const { router } = await openListings('/admin/listings?market=Atlantis');
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('removes a listing after a confirmation', async () => {
    const user = userEvent.setup();
    await openListings();
    await user.click(
      within(rowOf(active.id)).getByRole('button', {
        name: 'Remove Maize in Nairobi by Wanjiku Kamau',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Remove this listing?' });
    expect(dialog).toHaveTextContent(
      'Buyers can no longer see it. Orders waiting for payment are cancelled and their produce is released. Paid orders are not affected.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Remove listing' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Listing removed.'));
    expect(recorder.of('DELETE', `/api/v1/admin/listings/${active.id}`)).toHaveLength(1);
    await waitFor(() => expect(listRequests().length).toBeGreaterThan(1));
  });

  it('keeps the dialog open with Close on 409 listing_has_open_payments', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete(apiUrl('/api/v1/admin/listings/:id'), () =>
        errorResponse(409, 'listing_has_open_payments'),
      ),
    );
    await openListings();
    await user.click(
      within(rowOf(active.id)).getByRole('button', {
        name: 'Remove Maize in Nairobi by Wanjiku Kamau',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Remove listing' }));
    const dialog = screen.getByRole('dialog');
    expect(
      await within(dialog).findByText(
        'A payment is in progress for this listing. Try again in a few minutes.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Remove listing' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(recorder.of('DELETE', `/api/v1/admin/listings/${active.id}`)).toHaveLength(1);
  });

  it('refreshes the list on 404 listing_not_found', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete(apiUrl('/api/v1/admin/listings/:id'), () =>
        errorResponse(404, 'listing_not_found'),
      ),
    );
    await openListings();
    const before = listRequests().length;
    await user.click(
      within(rowOf(active.id)).getByRole('button', {
        name: 'Remove Maize in Nairobi by Wanjiku Kamau',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Remove listing' }));
    expect(
      await screen.findByText('This listing could not be found. The list has been refreshed.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(listRequests().length).toBeGreaterThan(before));
  });

  it('keeps working when GET /markets fails', async () => {
    server.use(http.get(apiUrl('/api/v1/markets'), () => errorResponse(500, 'internal_error')));
    await openListings();
    expect(await screen.findByText('Market filter is unavailable right now.')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Market'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All markets']);
    expect(screen.getByTestId('list-count')).toHaveTextContent('Showing 4 of 4');
  });

  it('shows an error with the reference and Try again', async () => {
    server.use(
      http.get(apiUrl('/api/v1/admin/listings'), () =>
        errorResponse(500, 'internal_error', { requestId: 'req-listings' }),
      ),
    );
    renderAdmin('/admin/listings');
    expect(await screen.findByText('Listings could not be loaded')).toBeInTheDocument();
    expect(screen.getByText('req-listings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    server.use(
      http.get(apiUrl('/api/v1/admin/listings'), () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }),
      ),
    );
    await openListings();
    expect(screen.getByText('No listings yet')).toBeInTheDocument();
  });
});
