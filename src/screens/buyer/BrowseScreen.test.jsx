import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import {
  expectNoPriceRequests,
  makeListings,
  recordAll,
  renderBuyer,
  serveBrowse,
} from '@/test/buyer';
import { queryClient } from '@/lib/queryClient';

/** @type {ReturnType<typeof recordAll>} */
let recorder;
beforeEach(() => {
  recorder = recordAll();
});
afterEach(() => {
  expectNoPriceRequests(recorder);
  recorder.stop();
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
});

const browseRequests = () => recorder.of('GET', '/api/v1/listings').map((r) => r.query);

async function openBrowse(path = '/buyer/browse') {
  const utils = renderBuyer(path);
  await screen.findByRole('heading', { name: 'Browse produce', level: 1 }, { timeout: 5000 });
  await waitFor(() => expect(screen.queryByText('Loading produce…')).not.toBeInTheDocument());
  return utils;
}

const card = (/** @type {string} */ id) =>
  /** @type {HTMLElement} */ (document.querySelector(`[data-listing-id="${id}"]`));

describe('BrowseScreen', () => {
  it('lists active listings as cards that are one link each with a clear name', async () => {
    await openBrowse();
    const [first] = fixtures.publicListingsPage.items;
    const link = screen.getByRole('link', {
      name: 'Maize in Nairobi, KES 42.00 per kg, Sold by Grace Wanjiru',
    });
    expect(link).toHaveAttribute('href', `/buyer/listings/${first.id}`);
    expect(link).toBe(card(first.id));
    expect(link).toHaveTextContent('120 kg available');
    // One link per card, nothing interactive nested inside.
    expect(within(link).queryAllByRole('link')).toHaveLength(0);
    expect(within(link).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByTestId('browse-count')).toHaveTextContent('Showing 5 of 5');
    expect(screen.getByText('Prices are set by the farmers selling the produce.')).toBeVisible();
  });

  it('shows a meaningful alt text for photos and a placeholder for missing or unsafe ones', async () => {
    await openBrowse();
    const [withPhoto, noPhoto, insecure] = fixtures.publicListingsPage.items;
    const img = within(card(withPhoto.id)).getByRole('img', { name: 'Photo of maize for sale' });
    expect(img).toHaveAttribute('src', withPhoto.image_url);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(within(card(noPhoto.id)).queryByRole('img')).toBeNull();
    expect(within(card(noPhoto.id)).getByTestId('produce-photo-placeholder')).toBeInTheDocument();
    // An http image URL is never rendered.
    expect(within(card(insecure.id)).queryByRole('img')).toBeNull();
    expect(document.querySelector(`img[src^="http:"]`)).toBeNull();
  });

  it('sends the first page with limit 20 and offset 0 and no filters', async () => {
    await openBrowse();
    expect(browseRequests()).toEqual([{ sort: 'newest', limit: '20', offset: '0' }]);
  });

  it('sends crop, market and sort exactly as specified and keeps them in the URL', async () => {
    const user = userEvent.setup();
    const { router } = await openBrowse();
    await user.click(screen.getByRole('radio', { name: 'Beans' }));
    await waitFor(() => expect(router.state.location.search).toBe('?crop=beans'));
    await user.selectOptions(screen.getByLabelText('Market'), 'Kisumu');
    await user.selectOptions(screen.getByLabelText('Sort by'), 'price_desc');
    await waitFor(() =>
      expect(router.state.location.search).toBe('?crop=beans&market=Kisumu&sort=price_desc'),
    );
    await waitFor(() =>
      expect(browseRequests().at(-1)).toEqual({
        crop: 'beans',
        market: 'Kisumu',
        sort: 'price_desc',
        limit: '20',
        offset: '0',
      }),
    );
    expect(await screen.findByText('Showing 1 of 1')).toBeInTheDocument();
  });

  it('offers every buyer market and "All markets" (no GET /markets)', async () => {
    await openBrowse();
    const options = within(screen.getByLabelText('Market'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['All markets', 'Nairobi', 'Kisumu', 'Mombasa', 'Nakuru']);
    const sorts = within(screen.getByLabelText('Sort by'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(sorts).toEqual(['Newest', 'Price: low to high', 'Price: high to low']);
  });

  it('reads valid filters from the URL and replaces invalid ones by the defaults', async () => {
    const { router } = await openBrowse(
      '/buyer/browse?crop=rice&market=Paris&sort=cheapest&min=abc&max=50',
    );
    await waitFor(() => expect(router.state.location.search).toBe('?max=50'));
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.getByLabelText('Market')).toHaveValue('');
    expect(screen.getByLabelText('Sort by')).toHaveValue('newest');
    expect(screen.getByLabelText('Lowest price (KES per kg)')).toHaveValue('');
    expect(screen.getByLabelText('Highest price (KES per kg)')).toHaveValue('50');
    expect(browseRequests().every((q) => !('crop' in q) && !('market' in q))).toBe(true);
    expect(browseRequests().at(-1)).toEqual({
      max_price: '50',
      sort: 'newest',
      limit: '20',
      offset: '0',
    });
  });

  it('drops a minimum above the maximum from the URL', async () => {
    const { router } = await openBrowse('/buyer/browse?min=90&max=10&crop=maize');
    await waitFor(() => expect(router.state.location.search).toBe('?crop=maize'));
    expect(browseRequests().every((q) => !('min_price' in q))).toBe(true);
  });

  it('waits 400 ms after typing a price before sending it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { router } = await openBrowse();
      const before = browseRequests().length;
      await user.type(screen.getByLabelText('Lowest price (KES per kg)'), '40');
      await act(() => vi.advanceTimersByTimeAsync(300));
      expect(router.state.location.search).toBe('');
      expect(browseRequests()).toHaveLength(before);
      await act(() => vi.advanceTimersByTimeAsync(150));
      await waitFor(() => expect(router.state.location.search).toBe('?min=40'));
      await waitFor(() =>
        expect(browseRequests().at(-1)).toEqual({
          min_price: '40',
          sort: 'newest',
          limit: '20',
          offset: '0',
        }),
      );
      expect(browseRequests()).toHaveLength(before + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends prices as normalised decimals', async () => {
    await openBrowse('/buyer/browse?min=010.50&max=200.00');
    await waitFor(() =>
      expect(browseRequests().at(-1)).toEqual({
        min_price: '10.5',
        max_price: '200',
        sort: 'newest',
        limit: '20',
        offset: '0',
      }),
    );
  });

  it('shows a message and sends no request when the minimum is above the maximum', async () => {
    const user = userEvent.setup();
    const { router } = await openBrowse();
    await user.type(screen.getByLabelText('Lowest price (KES per kg)'), '90');
    await user.type(screen.getByLabelText('Highest price (KES per kg)'), '10');
    expect(await screen.findByTestId('price-message')).toHaveTextContent(
      'The lowest price cannot be above the highest price.',
    );
    expect(screen.getByLabelText('Lowest price (KES per kg)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    const count = browseRequests().length;
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(browseRequests()).toHaveLength(count);
    expect(router.state.location.search).not.toContain('max=10');
    expect(browseRequests().some((q) => q.max_price === '10')).toBe(false);
  });

  it.each([
    ['letters', 'abc', 'Enter a number using digits only, for example 82.50.'],
    ['a comma', '1,5', 'Use a dot for decimals, for example 82.50'],
    ['more than 100 000', '100001', 'Enter 100,000 or less.'],
  ])('rejects a price with %s inline', async (_name, text, message) => {
    const user = userEvent.setup();
    await openBrowse();
    const count = browseRequests().length;
    await user.type(screen.getByLabelText('Highest price (KES per kg)'), text);
    expect(await screen.findByTestId('price-message')).toHaveTextContent(message);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(browseRequests()).toHaveLength(count);
  });

  it('loads more with "Showing X of Y"', async () => {
    const user = userEvent.setup();
    serveBrowse(makeListings(25));
    await openBrowse();
    expect(screen.getByTestId('browse-count')).toHaveTextContent('Showing 20 of 25');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(screen.getByTestId('browse-count')).toHaveTextContent('Showing 25 of 25'),
    );
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(browseRequests().map((q) => q.offset)).toEqual(['0', '20']);
  });

  it('shows "No produce is listed right now" when nothing is listed', async () => {
    serveBrowse([]);
    await openBrowse();
    expect(
      screen.getByRole('heading', {
        name: 'No produce is listed right now. Please check again soon.',
      }),
    ).toBeInTheDocument();
  });

  it('shows "No listings match these filters" with Clear filters', async () => {
    const user = userEvent.setup();
    const { router } = await openBrowse('/buyer/browse?market=Nakuru&crop=beans');
    expect(
      await screen.findByRole('heading', { name: 'No listings match these filters.' }),
    ).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(clear[clear.length - 1]);
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(await screen.findByText('Showing 5 of 5')).toBeInTheDocument();
  });

  it('shows a 422 from the server as the filter message', async () => {
    server.use(
      http.get(apiUrl('/api/v1/listings'), () =>
        errorResponse(422, 'validation_error', {
          extra: {
            fields: ['market'],
            details: [{ field: 'market', message: 'Unknown market.' }],
          },
        }),
      ),
    );
    await openBrowse('/buyer/browse?market=Nairobi');
    const message = await screen.findByTestId('server-filter-message');
    expect(message).toHaveTextContent('These filters could not be used');
    expect(message).toHaveTextContent('Unknown market.');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows an error with Try again and the reference for a 500', async () => {
    server.use(
      http.get(apiUrl('/api/v1/listings'), () =>
        errorResponse(500, 'internal_error', { requestId: 'req-browse-500' }),
      ),
    );
    await openBrowse();
    const alert = /** @type {HTMLElement} */ (
      (await screen.findByText('Produce could not be loaded')).closest('[role="alert"]')
    );
    expect(alert).toHaveTextContent('Produce could not be loaded');
    expect(alert).toHaveTextContent('Reference: req-browse-500');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('never shows a sold out or inactive listing, even if the server sent one', async () => {
    const [a, b] = fixtures.publicListingsPage.items;
    server.use(
      http.get(apiUrl('/api/v1/listings'), () =>
        HttpResponse.json({
          items: [a, { ...b, status: 'sold_out', quantity_available: 0 }],
          total: 2,
          limit: 20,
          offset: 0,
        }),
      ),
    );
    await openBrowse();
    expect(card(a.id)).not.toBeNull();
    expect(card(b.id)).toBeNull();
  });

  it('refetches when the window regains focus (once the 30 second stale time passed)', async () => {
    await openBrowse();
    const count = browseRequests().length;
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 31_000 });
    try {
      await act(async () => {
        window.dispatchEvent(new Event('visibilitychange'));
      });
      await waitFor(() => expect(browseRequests().length).toBeGreaterThan(count));
    } finally {
      vi.useRealTimers();
    }
  });

  it('never shows a seller contact detail, even if the response carried one', async () => {
    serveBrowse(
      fixtures.publicListingsPage.items.map((l) => ({
        ...l,
        seller_phone: '0712345678',
        seller_email: 'grace@example.com',
        farmer_id: 'f1e2d3c4-0000-4000-8000-000000000000',
      })),
    );
    const { container } = await openBrowse();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/(\+?254|0)7\d{8}/);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toContain('f1e2d3c4');
  });
});
