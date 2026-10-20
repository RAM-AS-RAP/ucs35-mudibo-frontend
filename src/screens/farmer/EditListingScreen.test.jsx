import { readFileSync } from 'node:fs';
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
import { formEntries, makeListings, serveListings, spyListingWrites } from '@/test/listings';
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
  vi.clearAllMocks();
});

const [active, soldOut, removed] = fixtures.myListingsPage.items;

/** @param {string} id */
async function openEdit(id) {
  const utils = renderFarmer(`/farmer/listings/${id}/edit`);
  await screen.findByRole('heading', { name: 'Edit listing', level: 1 });
  await waitFor(() => expect(screen.queryByText('Loading the listing…')).not.toBeInTheDocument());
  return utils;
}

const save = () => screen.getByRole('button', { name: 'Save changes' });

/** PATCH answered without reading the body. @param {() => Response} [answer] */
function answerPatch(answer) {
  /** @type {Request[]} */
  const requests = [];
  server.use(
    http.patch(apiUrl('/api/v1/listings/:id'), ({ request }) => {
      requests.push(request);
      return answer ? answer() : HttpResponse.json(active);
    }),
  );
  return requests;
}

describe('EditListingScreen', () => {
  it('shows crop and market read only with the explanation, and the current values', async () => {
    await openEdit(active.id);
    expect(screen.getByText('Maize', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('Nairobi', { selector: 'dd' })).toBeInTheDocument();
    expect(
      screen.getByText('To change the crop or market, remove this listing and create a new one.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Market')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Quantity (kg)')).toHaveValue('120.5');
    expect(screen.getByLabelText('Asking price')).toHaveValue('42');
    expect(
      screen.getByText(
        'Quantity available now. Orders waiting for payment are already taken out of this number.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Photo of maize listing' })).toHaveAttribute(
      'src',
      active.image_url,
    );
  });

  it('keeps Save disabled until something changes (the same amount typed differently is no change)', async () => {
    const user = userEvent.setup();
    await openEdit(active.id);
    expect(save()).toBeDisabled();
    const price = screen.getByLabelText('Asking price');
    await user.clear(price);
    await user.type(price, '42.00');
    expect(save()).toBeDisabled();
    await user.clear(price);
    await user.type(price, '45');
    expect(save()).toBeEnabled();
  });

  it('sends only the changed field', async () => {
    const user = userEvent.setup();
    const calls = spyListingWrites();
    const requests = answerPatch();
    const { router } = await openEdit(active.id);
    const price = screen.getByLabelText('Asking price');
    await user.clear(price);
    await user.type(price, '45.50');
    await user.click(save());
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer/listings'));
    expect(toast.success).toHaveBeenCalledWith('Changes saved');
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe(`/api/v1/listings/${active.id}`);
    expect(requests[0].headers.get('Content-Type')).toMatch(/^multipart\/form-data; boundary=/);
    expect(formEntries(calls[0].form)).toEqual([['price_per_unit', '45.5']]);
  });

  it('sends remove_image for "Remove photo"', async () => {
    const user = userEvent.setup();
    const calls = spyListingWrites();
    answerPatch();
    await openEdit(active.id);
    await user.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(
      screen.getAllByText('The current photo will be removed when you save.'),
    ).not.toHaveLength(0);
    expect(screen.queryByRole('img', { name: 'Photo of maize listing' })).not.toBeInTheDocument();
    await user.click(save());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(formEntries(calls[0].form)).toEqual([['remove_image', 'true']]);
  });

  it('confirms before setting the quantity to 0', async () => {
    const user = userEvent.setup();
    const calls = spyListingWrites();
    const requests = answerPatch();
    await openEdit(active.id);
    const quantity = screen.getByLabelText('Quantity (kg)');
    await user.clear(quantity);
    await user.type(quantity, '0');
    await user.click(save());
    const dialog = await screen.findByRole('dialog', { name: 'Mark as sold out?' });
    expect(dialog).toHaveTextContent('Setting the quantity to 0 marks this listing as sold out.');
    expect(requests).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests).toHaveLength(0);
    await user.click(save());
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save as sold out' }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(formEntries(calls[0].form)).toEqual([['quantity_available', '0']]);
  });

  it('says a sold out listing becomes active again above 0', async () => {
    const user = userEvent.setup();
    await openEdit(soldOut.id);
    expect(screen.queryByText('This listing will become active again.')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Quantity (kg)'));
    await user.type(screen.getByLabelText('Quantity (kg)'), '25');
    expect(screen.getByText('This listing will become active again.')).toBeInTheDocument();
  });

  it('shows a removed listing read only, without a form', async () => {
    await openEdit(removed.id);
    expect(screen.getByRole('status')).toHaveTextContent(
      'This listing was removed and can no longer be changed.',
    );
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quantity (kg)')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to My listings' })).toHaveAttribute(
      'href',
      '/farmer/listings',
    );
  });

  it('finds the listing through pages of 100 when it is not cached', async () => {
    const many = makeListings(150);
    const target = many[130];
    serveListings(many);
    const recorder = recordRequests();
    await openEdit(target.id);
    expect(screen.getByLabelText('Quantity (kg)')).toHaveValue(String(target.quantity_available));
    const lookups = recorder.requests.filter((r) => r.path === '/api/v1/listings/mine');
    expect(lookups.map((r) => r.query)).toEqual([
      { limit: '100', offset: '0' },
      { limit: '100', offset: '100' },
    ]);
  });

  it('stops after 5 pages and shows "This listing could not be found."', async () => {
    serveListings(makeListings(700));
    const recorder = recordRequests();
    await openEdit('6f0f2a1e-3b8c-4d5e-9f10-999999999999');
    expect(screen.getByText('This listing could not be found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to My listings' })).toBeInTheDocument();
    expect(recorder.requests.filter((r) => r.path === '/api/v1/listings/mine')).toHaveLength(5);
  });

  it('reads the listing from the cached list without another request', async () => {
    const user = userEvent.setup();
    const { router } = renderFarmer('/farmer/listings');
    await screen.findByTestId('listings-count');
    const recorder = recordRequests();
    const card = /** @type {HTMLElement} */ (
      document.querySelector(`[data-listing-id="${active.id}"]`)
    );
    await user.click(within(card).getByRole('link', { name: /^Edit/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/farmer/listings/${active.id}/edit`),
    );
    expect(await screen.findByLabelText('Quantity (kg)')).toHaveValue('120.5');
    expect(recorder.requests.filter((r) => r.path === '/api/v1/listings/mine')).toHaveLength(0);
  });

  it('replaces the form with the read only notice on listing_removed', async () => {
    const user = userEvent.setup();
    answerPatch(() => errorResponse(409, 'listing_removed'));
    await openEdit(active.id);
    await user.clear(screen.getByLabelText('Asking price'));
    await user.type(screen.getByLabelText('Asking price'), '45');
    await user.click(save());
    expect(
      await screen.findByText('This listing was removed and can no longer be changed.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Asking price')).not.toBeInTheDocument();
  });

  it('shows the not found state on listing_not_found', async () => {
    const user = userEvent.setup();
    answerPatch(() => errorResponse(404, 'listing_not_found'));
    await openEdit(active.id);
    await user.clear(screen.getByLabelText('Asking price'));
    await user.type(screen.getByLabelText('Asking price'), '45');
    await user.click(save());
    expect(await screen.findByText('This listing could not be found.')).toBeInTheDocument();
  });

  it('shows no_changes as a form message', async () => {
    const user = userEvent.setup();
    answerPatch(() => errorResponse(422, 'no_changes'));
    await openEdit(active.id);
    await user.clear(screen.getByLabelText('Asking price'));
    await user.type(screen.getByLabelText('Asking price'), '45');
    await user.click(save());
    expect(
      await screen.findByRole('alert', { name: 'The listing was not saved' }),
    ).toHaveTextContent('Nothing was changed.');
  });

  it('records the backend gap in the README', () => {
    const readme = readFileSync('README.md', 'utf8');
    const gaps = readme.slice(readme.indexOf('## Known backend gaps'));
    expect(gaps).toMatch(/backend gap: farmers cannot fetch a single listing/);
  });
});
