import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { recordRequests, renderFarmer } from '@/test/farmer';
import { makeListings, serveListings } from '@/test/listings';
import { queryClient } from '@/lib/queryClient';

vi.mock('sonner', async (importOriginal) => {
  const actual = /** @type {typeof import('sonner')} */ (await importOriginal());
  return { ...actual, toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) };
});

afterEach(() => {
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
  vi.clearAllMocks();
});

const [active, soldOut, removed] = fixtures.myListingsPage.items;

/** @param {string} id */
const card = (id) =>
  /** @type {HTMLElement} */ (document.querySelector(`[data-listing-id="${id}"]`));

async function openListings(path = '/farmer/listings') {
  const utils = renderFarmer(path);
  await screen.findByRole('heading', { name: 'My listings', level: 1 });
  await waitFor(() => expect(screen.queryByText('Loading your listings…')).not.toBeInTheDocument());
  return utils;
}

describe('MyListingsScreen', () => {
  it('shows each listing with photo or placeholder, quantity, price and status', async () => {
    await openListings();
    expect(screen.getByTestId('listings-count')).toHaveTextContent('Showing 3 of 3');

    const a = card(active.id);
    expect(within(a).getByRole('heading', { level: 2 })).toHaveTextContent('Maize in Nairobi');
    expect(a).toHaveTextContent('120.5 kg available');
    expect(a).toHaveTextContent('KES 42.00 per kg');
    expect(a).toHaveTextContent('Active');
    const img = within(a).getByRole('img', { name: 'Photo of maize listing' });
    expect(img).toHaveAttribute('src', active.image_url);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');

    const s = card(soldOut.id);
    expect(s).toHaveTextContent('0 kg available');
    expect(s).toHaveTextContent('Sold out');
    expect(within(s).queryByRole('img')).not.toBeInTheDocument();
    expect(within(s).getByTestId('listing-photo-placeholder')).toBeInTheDocument();
  });

  it('has no Edit or Remove for a removed listing, but keeps View orders', async () => {
    await openListings();
    const r = card(removed.id);
    expect(r).toHaveTextContent('Removed');
    expect(within(r).queryByRole('link', { name: /^Edit/ })).not.toBeInTheDocument();
    expect(within(r).queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
    expect(within(r).getByRole('link', { name: /^View orders/ })).toHaveAttribute(
      'href',
      `/farmer/orders?listing=${removed.id}`,
    );
    const a = card(active.id);
    expect(within(a).getByRole('link', { name: /^Edit/ })).toHaveAttribute(
      'href',
      `/farmer/listings/${active.id}/edit`,
    );
  });

  it('never renders an image URL that is not https', async () => {
    serveListings([
      { ...active, image_url: 'javascript:alert(1)' },
      { ...soldOut, image_url: 'http://images.agrisence.test/x.jpg' },
    ]);
    await openListings();
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getAllByTestId('listing-photo-placeholder')).toHaveLength(2);
  });

  it.each([
    ['Active', 'active'],
    ['Sold out', 'sold_out'],
    ['Removed', 'removed'],
  ])('the %s tab sends status=%s and keeps it in the URL', async (label, status) => {
    const user = userEvent.setup();
    const recorder = recordRequests();
    const { router } = await openListings();
    await user.click(screen.getByRole('radio', { name: label }));
    await waitFor(() => expect(router.state.location.search).toBe(`?status=${status}`));
    await waitFor(() =>
      expect(
        recorder.requests.some(
          (r) => r.path === '/api/v1/listings/mine' && r.query.status === status,
        ),
      ).toBe(true),
    );
    // "All" sends no status.
    expect(
      recorder.requests.find((r) => r.path === '/api/v1/listings/mine')?.query.status,
    ).toBeUndefined();
    await waitFor(() =>
      expect(screen.getByTestId('listings-count')).toHaveTextContent('Showing 1 of 1'),
    );
  });

  it('removes an invalid status from the URL', async () => {
    const { router } = await openListings('/farmer/listings?status=deleted');
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
  });

  it('pages with Load more using total', async () => {
    const user = userEvent.setup();
    serveListings(makeListings(45));
    await openListings();
    expect(screen.getByTestId('listings-count')).toHaveTextContent('Showing 20 of 45');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(screen.getByTestId('listings-count')).toHaveTextContent('Showing 40 of 45'),
    );
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(screen.getByTestId('listings-count')).toHaveTextContent('Showing 45 of 45'),
    );
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('shows the empty state with "Create your first listing" and the forecast link', async () => {
    serveListings([]);
    await openListings();
    expect(screen.getByRole('heading', { name: 'You have no listings yet.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your first listing' })).toHaveAttribute(
      'href',
      '/farmer/listings/new',
    );
    expect(screen.getByRole('link', { name: 'Check the forecast first' })).toHaveAttribute(
      'href',
      '/farmer/forecast',
    );
  });

  it('shows an error with Try again and the reference', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(apiUrl('/api/v1/listings/mine'), () =>
        errorResponse(500, 'internal_error', { requestId: 'req-list-500' }),
      ),
    );
    renderFarmer('/farmer/listings');
    const alert = await screen.findByRole('alert', {}, { timeout: 8000 });
    expect(alert).toHaveTextContent('Your listings could not be loaded');
    expect(alert).toHaveTextContent('req-list-500');
    server.use(
      http.get(apiUrl('/api/v1/listings/mine'), () => HttpResponse.json(fixtures.myListingsPage)),
    );
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('listings-count')).toHaveTextContent('Showing 3 of 3');
  });

  it('removes a listing after confirmation, shows a toast and refreshes the list', async () => {
    const user = userEvent.setup();
    const recorder = recordRequests();
    await openListings();
    const trigger = within(card(active.id)).getByRole('button', { name: /^Remove/ });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Remove this listing?' });
    expect(dialog).toHaveTextContent(
      'Buyers will no longer see it. Orders that are already paid are not affected.',
    );
    serveListings([{ ...active, status: 'removed' }, soldOut, removed]);
    const before = recorder.requests.filter((r) => r.path === '/api/v1/listings/mine').length;
    await user.click(within(dialog).getByRole('button', { name: 'Remove listing' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Listing removed'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(recorder.requests.filter((r) => r.path === '/api/v1/listings/mine').length).toBe(
        before + 1,
      ),
    );
    expect(recorder.requests.some((r) => r.path === `/api/v1/listings/${active.id}`)).toBe(true);
  });

  it('shows 409 listing_has_pending_orders inside the dialog with a Close button', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete(apiUrl('/api/v1/listings/:id'), () =>
        errorResponse(409, 'listing_has_pending_orders', { requestId: 'req-409' }),
      ),
    );
    await openListings();
    const trigger = within(card(active.id)).getByRole('button', { name: /^Remove/ });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove listing' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A buyer has started paying for this listing. Try again in a few minutes.',
    );
    expect(within(dialog).getByRole('alert')).toHaveTextContent('req-409');
    expect(
      within(dialog).queryByRole('button', { name: 'Remove listing' }),
    ).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Focus returns to the button that opened the dialog.
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a 404 on remove closes the dialog and refreshes the list', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete(apiUrl('/api/v1/listings/:id'), () => errorResponse(404, 'listing_not_found')),
    );
    const recorder = recordRequests();
    await openListings();
    await user.click(within(card(active.id)).getByRole('button', { name: /^Remove/ }));
    const dialog = await screen.findByRole('dialog');
    serveListings([soldOut, removed]);
    await user.click(within(dialog).getByRole('button', { name: 'Remove listing' }));
    expect(
      await screen.findByText('This listing could not be found. The list has been refreshed.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('listings-count')).toHaveTextContent('Showing 2 of 2'),
    );
    expect(recorder.requests.filter((r) => r.path === '/api/v1/listings/mine').length).toBe(2);
  });

  it('Cancel closes the dialog without a request and returns focus', async () => {
    const user = userEvent.setup();
    const recorder = recordRequests();
    await openListings();
    const trigger = within(card(active.id)).getByRole('button', { name: /^Remove/ });
    await user.click(trigger);
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(recorder.requests.some((r) => r.path.startsWith('/api/v1/listings/6f'))).toBe(false);
  });
});
