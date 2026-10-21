// Accessibility of the farmer listing and order screens (F2b) in every state: loading, empty,
// error, success and dialog open; and the relative time rule on the price guidance.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { expectNoAxeViolations } from '@/test/axe';
import { logout, renderWithProviders } from '@/test/render';
import { renderFarmer } from '@/test/farmer';
import { serveListings, serveOrders } from '@/test/listings';
import {
  BROKEN_VALUE_PATTERNS,
  collectUserFacingStrings,
  expectNoAbsoluteTime,
} from '@/test/userFacing';
import { PriceGuidance } from '@/components/listings/PriceGuidance';
import { queryClient } from '@/lib/queryClient';

vi.mock('@/lib/image', () => ({
  prepareImage: vi.fn(async () => ({
    blob: new File([new Uint8Array([1])], 'photo.jpg', { type: 'image/jpeg' }),
    width: 1600,
    height: 1200,
    bytes: 240_000,
  })),
}));

afterEach(() => {
  logout();
  queryClient.clear();
});

const [active] = fixtures.myListingsPage.items;

/** Never "undefined", "NaN" or "null" on screen (dates are allowed on these screens). */
function expectNoBrokenValues(/** @type {Element} */ root) {
  const strings = collectUserFacingStrings(root);
  for (const pattern of BROKEN_VALUE_PATTERNS) {
    expect(strings.filter((s) => pattern.test(s))).toEqual([]);
  }
}

/** @param {string} path */
function hang(path, method = /** @type {'get' | 'post' | 'patch' | 'delete'} */ ('get')) {
  server.use(
    http[method](apiUrl(path), async () => {
      await delay('infinite');
      return HttpResponse.json({});
    }),
  );
}

/** @param {string} path */
function fail(path) {
  server.use(
    http.get(apiUrl(path), () => errorResponse(500, 'internal_error', { requestId: 'req-a11y' })),
  );
}

/**
 * @param {string} path
 * @param {() => Promise<unknown>} ready
 */
async function check(path, ready) {
  const utils = renderFarmer(path);
  await ready();
  await expectNoAxeViolations(utils.container, { page: true });
  expectNoBrokenValues(utils.container);
  return utils;
}

const h1 = (/** @type {string} */ name) => screen.findByRole('heading', { name, level: 1 });

describe('My listings', () => {
  it('loading', async () => {
    hang('/api/v1/listings/mine');
    await check('/farmer/listings', async () => {
      await h1('My listings');
      await screen.findByText('Loading your listings…');
    });
  });
  it('empty', async () => {
    serveListings([]);
    await check('/farmer/listings', () => screen.findByText('You have no listings yet.'));
  });
  it('error', async () => {
    fail('/api/v1/listings/mine');
    await check('/farmer/listings', () =>
      screen.findByText('Your listings could not be loaded', {}, { timeout: 8000 }),
    );
  });
  it('success', async () => {
    await check('/farmer/listings', () => screen.findByTestId('listings-count'));
  });
  it('remove dialog open', async () => {
    const user = userEvent.setup();
    const utils = renderFarmer('/farmer/listings');
    await screen.findByTestId('listings-count');
    const card = /** @type {HTMLElement} */ (
      document.querySelector(`[data-listing-id="${active.id}"]`)
    );
    await user.click(within(card).getByRole('button', { name: /^Remove/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Remove this listing?');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await expectNoAxeViolations(document.body);
    expect(utils.container).toBeTruthy();
  });
  it('status tabs are radios reachable with the keyboard and moved with the arrow keys', async () => {
    const user = userEvent.setup();
    const { router } = renderFarmer('/farmer/listings');
    await screen.findByTestId('listings-count');
    const all = screen.getByRole('radio', { name: 'All' });
    all.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Active' })).toBeChecked();
    await waitFor(() => expect(router.state.location.search).toBe('?status=active'));
  });
});

describe('New listing', () => {
  it('loading', async () => {
    hang('/api/v1/markets');
    await check('/farmer/listings/new', async () => {
      await h1('New listing');
      await screen.findByText('Loading markets…');
    });
  });
  it('no markets', async () => {
    server.use(http.get(apiUrl('/api/v1/markets'), () => HttpResponse.json([])));
    await check('/farmer/listings/new', () => screen.findByText('No markets available'));
  });
  it('error', async () => {
    fail('/api/v1/markets');
    await check('/farmer/listings/new', () => screen.findByRole('alert', {}, { timeout: 8000 }));
  });
  it('success with guidance, a confirm level price and a photo', async () => {
    const user = userEvent.setup();
    const utils = await check('/farmer/listings/new?market=Nairobi', async () => {
      await screen.findByLabelText('Market');
      await waitFor(() =>
        expect(screen.getByTestId('price-guidance')).toHaveTextContent('KES 40.00'),
      );
    });
    await user.type(screen.getByLabelText('Quantity (kg)'), '10');
    await user.type(screen.getByLabelText('Asking price'), '120');
    await screen.findByRole('checkbox');
    await expectNoAxeViolations(utils.container, { page: true });
  });
  it('server error summary', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/api/v1/listings'), () => errorResponse(409, 'listing_limit_reached')),
    );
    const utils = renderFarmer('/farmer/listings/new?market=Nairobi');
    await screen.findByLabelText('Market');
    await user.type(screen.getByLabelText('Quantity (kg)'), '10');
    await user.type(screen.getByLabelText('Asking price'), '41');
    await user.click(screen.getByRole('button', { name: 'Create listing' }));
    await screen.findByRole('alert', { name: 'The listing was not saved' });
    await expectNoAxeViolations(utils.container, { page: true });
  });
  it('the guidance panel shows no absolute date', async () => {
    const utils = renderFarmer('/farmer/listings/new?market=Kisumu&crop=maize');
    await waitFor(() =>
      expect(screen.getByTestId('price-guidance')).toHaveTextContent('1 month older'),
    );
    await waitFor(() => expect(screen.getByTestId('guidance-forecast')).toBeInTheDocument());
    expectNoAbsoluteTime(screen.getByTestId('price-guidance'), 'create screen guidance');
    expect(utils.container).toBeTruthy();
  });
});

describe('Edit listing', () => {
  it('loading', async () => {
    hang(`/api/v1/listings/mine/${active.id}`);
    await check(`/farmer/listings/${active.id}/edit`, () =>
      screen.findByText('Loading the listing…'),
    );
  });
  it('not found (back on My listings)', async () => {
    serveListings([]);
    await check(`/farmer/listings/${active.id}/edit`, () =>
      screen.findByRole('heading', { name: 'My listings', level: 1 }),
    );
  });
  it('success', async () => {
    await check(`/farmer/listings/${active.id}/edit`, () => screen.findByLabelText('Asking price'));
  });
  it('removed notice', async () => {
    const removed = fixtures.myListingsPage.items[2];
    await check(`/farmer/listings/${removed.id}/edit`, () =>
      screen.findByText('This listing was removed and can no longer be changed.'),
    );
  });
  it('quantity 0 dialog open, and focus returns to Save on Cancel', async () => {
    const user = userEvent.setup();
    renderFarmer(`/farmer/listings/${active.id}/edit`);
    const quantity = await screen.findByLabelText('Quantity (kg)');
    await user.clear(quantity);
    await user.type(quantity, '0');
    const save = screen.getByRole('button', { name: 'Save changes' });
    await user.click(save);
    const dialog = await screen.findByRole('dialog', { name: 'Mark as sold out?' });
    await expectNoAxeViolations(document.body);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(save).toHaveFocus());
  });
});

describe('Orders', () => {
  it('loading', async () => {
    hang('/api/v1/listings/mine/orders');
    await check('/farmer/orders', () => screen.findByText('Loading orders…'));
  });
  it('empty', async () => {
    serveOrders([]);
    await check('/farmer/orders', () => screen.findByText('No orders yet.'));
  });
  it('error', async () => {
    fail('/api/v1/listings/mine/orders');
    await check('/farmer/orders', () =>
      screen.findByText('Orders could not be loaded', {}, { timeout: 8000 }),
    );
  });
  it('success, filtered by one listing and by "Not paid"', async () => {
    await check(`/farmer/orders?status=not_paid&listing=${active.id}`, () =>
      screen.findByTestId('not-paid-note'),
    );
  });
});

describe('PriceGuidance on its own', () => {
  it.each([
    ['with a market', 'Nairobi'],
    ['lagging market', 'Kisumu'],
    ['without a market', null],
  ])('%s: axe clean and relative time only', async (_name, market) => {
    const { container } = renderWithProviders(<PriceGuidance crop="maize" market={market} />);
    if (market) {
      await waitFor(() => expect(screen.getByTestId('guidance-forecast')).toBeInTheDocument());
    }
    await expectNoAxeViolations(container);
    expectNoAbsoluteTime(container, `PriceGuidance ${market}`);
  });

  it('stays quiet when prices and the forecast fail', async () => {
    fail('/api/v1/prices/current');
    fail('/api/v1/forecasts');
    const { container } = renderWithProviders(<PriceGuidance crop="maize" market="Nairobi" />);
    expect(
      await screen.findByText(
        'The latest price could not be loaded. You can still save the listing.',
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('No forecast for this market yet.', {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoAbsoluteTime(container, 'PriceGuidance error');
  });
});
