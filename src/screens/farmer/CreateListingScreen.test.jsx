import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, validationErrorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { recordRequests, renderFarmer } from '@/test/farmer';
import { formEntries, spyListingWrites } from '@/test/listings';
import { queryClient } from '@/lib/queryClient';
import { prepareImage } from '@/lib/image';

vi.mock('sonner', async (importOriginal) => {
  const actual = /** @type {typeof import('sonner')} */ (await importOriginal());
  return { ...actual, toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) };
});
vi.mock('@/lib/image', () => ({ prepareImage: vi.fn() }));

const preparedPhoto = () => ({
  blob: new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg', { type: 'image/jpeg' }),
  width: 1600,
  height: 1200,
  bytes: 240_000,
});

beforeEach(() => {
  vi.mocked(prepareImage).mockResolvedValue(preparedPhoto());
});

afterEach(() => {
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

/** POST /listings answered without reading the body (see src/test/listings.js). */
function answerCreate(
  response = () => HttpResponse.json(fixtures.listingCreated, { status: 201 }),
) {
  /** @type {Request[]} */
  const requests = [];
  server.use(
    http.post(apiUrl('/api/v1/listings'), async ({ request }) => {
      requests.push(request);
      return response();
    }),
  );
  return requests;
}

async function openCreate(path = '/farmer/listings/new') {
  const utils = renderFarmer(path);
  await screen.findByRole('heading', { name: 'New listing', level: 1 });
  await screen.findByLabelText('Market');
  return utils;
}

/**
 * @param {ReturnType<typeof userEvent.setup>} user
 * @param {{ market?: string, quantity?: string, price?: string }} values
 */
async function fill(user, { market = 'Nairobi', quantity = '100', price = '42.5' } = {}) {
  if (market) await user.selectOptions(screen.getByLabelText('Market'), market);
  if (quantity) await user.type(screen.getByLabelText('Quantity (kg)'), quantity);
  if (price) await user.type(screen.getByLabelText('Asking price'), price);
}

const submit = () => screen.getByRole('button', { name: 'Create listing' });

/** @param {File} file */
function pickPhoto(file, testId = 'photo-gallery-input') {
  fireEvent.change(screen.getByTestId(testId), { target: { files: [file] } });
}

describe('CreateListingScreen: preselection', () => {
  it('preselects crop and market from valid query parameters', async () => {
    await openCreate('/farmer/listings/new?crop=beans&market=Kisumu');
    expect(screen.getByRole('radio', { name: 'Beans' })).toBeChecked();
    expect(screen.getByLabelText('Market')).toHaveValue('Kisumu');
  });

  it('ignores invalid values and preselects maize with no market', async () => {
    await openCreate('/farmer/listings/new?crop=rice&market=Mombasa');
    expect(screen.getByRole('radio', { name: 'Maize' })).toBeChecked();
    expect(screen.getByLabelText('Market')).toHaveValue('');
  });

  it('the forecast screen\'s "Plan a listing" link lands here with its parameters applied', async () => {
    const user = userEvent.setup();
    const { router } = renderFarmer('/farmer/forecast?market=Kisumu&crop=beans');
    await user.click(
      await screen.findByRole('button', { name: 'Request 1 month forecast' }, { timeout: 8000 }),
    );
    const link = await screen.findByRole('link', { name: /Plan a listing/ }, { timeout: 8000 });
    await user.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer/listings/new'));
    await screen.findByRole('heading', { name: 'New listing', level: 1 });
    await waitFor(() => expect(screen.getByLabelText('Market')).toHaveValue('Kisumu'));
    expect(screen.getByRole('radio', { name: 'Beans' })).toBeChecked();
  });
});

describe('CreateListingScreen: the request', () => {
  it('sends multipart with exactly the allowed fields, string decimals and a JPEG photo', async () => {
    const user = userEvent.setup();
    const calls = spyListingWrites();
    const requests = answerCreate();
    const { router } = await openCreate();
    await fill(user, { quantity: '100.50', price: '42.50' });
    pickPhoto(new File(['x'], 'IMG_2001.png', { type: 'image/png' }));
    expect(await screen.findByText('Photo ready, 240 kB')).toBeInTheDocument();
    await user.click(submit());
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer/listings'));
    expect(toast.success).toHaveBeenCalledWith('Listing created');
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get('Content-Type')).toMatch(/^multipart\/form-data; boundary=/);
    expect(calls).toHaveLength(1);
    expect(formEntries(calls[0].form)).toEqual([
      ['crop', 'maize'],
      ['market', 'Nairobi'],
      ['quantity_available', '100.5'],
      ['price_per_unit', '42.5'],
      ['image', { file: 'photo.jpg', type: 'image/jpeg' }],
    ]);
  });

  it('sends no image part when no photo was chosen', async () => {
    const user = userEvent.setup();
    const calls = spyListingWrites();
    answerCreate();
    await openCreate();
    await fill(user);
    await user.click(submit());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(formEntries(calls[0].form).map(([name]) => name)).toEqual([
      'crop',
      'market',
      'quantity_available',
      'price_per_unit',
    ]);
  });

  it('a double click sends one request', async () => {
    const user = userEvent.setup();
    const requests = answerCreate(async () => {
      await delay(300);
      return HttpResponse.json(fixtures.listingCreated, { status: 201 });
    });
    await openCreate();
    await fill(user);
    await user.dblClick(submit());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled());
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(requests).toHaveLength(1);
  });

  it('validates quantity and price before sending anything', async () => {
    const user = userEvent.setup();
    const requests = answerCreate();
    await openCreate();
    await fill(user, { quantity: '12,5', price: '1e3' });
    await user.click(submit());
    expect(
      await screen.findByText('Use a dot for decimals, for example 82.50'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Enter a number using digits only, for example 82.50.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity (kg)')).toHaveAttribute('aria-invalid', 'true');
    expect(requests).toHaveLength(0);
  });
});

describe('CreateListingScreen: price guidance and checks', () => {
  it('shows the estimate line from integer arithmetic', async () => {
    const user = userEvent.setup();
    await openCreate();
    await fill(user, { quantity: '2.5', price: '112.56' });
    expect(screen.getByTestId('listing-estimate')).toHaveTextContent(
      'EstimateIf all 2.5 kg sell at this price: KES 281.40',
    );
  });

  it('shows a caution message for a price 60% above the latest', async () => {
    const user = userEvent.setup();
    await openCreate();
    await fill(user, { price: '64' });
    expect(
      await screen.findByText(
        'This is about 60% above the latest price in Nairobi. Check that the price is for 1 kg.',
      ),
    ).toBeInTheDocument();
    expect(submit()).toBeEnabled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('requires the confirmation checkbox for 3 times the latest price', async () => {
    const user = userEvent.setup();
    const requests = answerCreate();
    await openCreate();
    await fill(user, { price: '120' });
    expect(
      await screen.findByText(
        'This is about 3 times the latest price in Nairobi (KES 40.00 per kg). Check that the price is for 1 kg, not for a bag.',
      ),
    ).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    await user.click(
      screen.getByRole('checkbox', { name: 'The price is for 1 kg and is correct' }),
    );
    expect(submit()).toBeEnabled();
    // Changing the price asks again.
    await user.type(screen.getByLabelText('Asking price'), '0');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(submit()).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(submit());
    await waitFor(() => expect(requests).toHaveLength(1));
  });

  it('shows the latest price and the one month forecast in the guidance panel', async () => {
    const user = userEvent.setup();
    await openCreate();
    const panel = screen.getByTestId('price-guidance');
    expect(panel).toHaveTextContent('Choose a market to see its latest price.');
    await user.selectOptions(screen.getByLabelText('Market'), 'Nairobi');
    await waitFor(() => expect(panel).toHaveTextContent('Latest priceKES 40.00per kg'));
    await waitFor(() =>
      expect(within(panel).getByTestId('guidance-forecast')).toHaveTextContent(
        'In 1 month+6.2%Increasing',
      ),
    );
    expect(panel).toHaveTextContent('You choose the price you ask for.');
    expect(within(panel).getByRole('link', { name: /See the forecast/ })).toHaveAttribute(
      'href',
      '/farmer/forecast?market=Nairobi&crop=maize',
    );
  });
});

describe('CreateListingScreen: server errors', () => {
  it('maps 422 field errors to the fields and the summary', async () => {
    const user = userEvent.setup();
    answerCreate(() =>
      validationErrorResponse([
        { field: 'price_per_unit', message: 'Value error, Price too high' },
      ]),
    );
    await openCreate();
    await fill(user);
    await user.click(submit());
    const summary = await screen.findByRole('alert', { name: 'The listing was not saved' });
    expect(within(summary).getByRole('link', { name: 'Price too high.' })).toHaveAttribute(
      'href',
      '#listing-price',
    );
    expect(screen.getByLabelText('Asking price')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(summary).toHaveFocus());
  });

  it('shows listing_limit_reached', async () => {
    const user = userEvent.setup();
    answerCreate(() => errorResponse(409, 'listing_limit_reached', { requestId: 'req-limit' }));
    await openCreate();
    await fill(user);
    await user.click(submit());
    const summary = await screen.findByRole('alert', { name: 'The listing was not saved' });
    expect(summary).toHaveTextContent(
      'You already have 50 active listings. Remove or sell one before adding another.',
    );
    // A 4xx is the farmer's to fix, so no support reference is shown (useServerProblem).
    expect(summary).not.toHaveTextContent('req-limit');
    expect(summary).not.toHaveTextContent('Reference');
  });

  it.each([
    ['invalid_image', 422, 'That photo could not be used. Choose a JPEG or PNG photo.'],
    ['image_too_large', 413, 'That photo is too large.'],
  ])('shows %s next to the photo', async (code, status, message) => {
    const user = userEvent.setup();
    answerCreate(() => errorResponse(status, code));
    await openCreate();
    await fill(user);
    pickPhoto(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    await screen.findByText('Photo ready, 240 kB');
    await user.click(submit());
    expect(await screen.findByTestId('photo-error')).toHaveTextContent(message);
  });

  it('shows market_not_available on the market field', async () => {
    const user = userEvent.setup();
    answerCreate(() => errorResponse(404, 'market_not_available'));
    await openCreate();
    await fill(user);
    await user.click(submit());
    expect(
      await screen.findAllByText('This market has no price data yet. Choose another market.'),
    ).not.toHaveLength(0);
    expect(screen.getByLabelText('Market')).toHaveAttribute('aria-invalid', 'true');
  });

  it('counts down after 429 using Retry-After', async () => {
    const user = userEvent.setup();
    answerCreate(() => errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '30' } }));
    await openCreate();
    await fill(user);
    await user.click(submit());
    expect(await screen.findByRole('button', { name: 'Try again in 30 s' })).toBeDisabled();
    expect(screen.getByRole('alert', { name: 'The listing was not saved' })).toHaveTextContent(
      'Too many attempts. Try again in 30 seconds.',
    );
  });

  it.each([
    ['a network failure', () => HttpResponse.error()],
    [
      'a timeout',
      async () => {
        await delay('infinite');
        return HttpResponse.json({});
      },
    ],
  ])('after %s it offers no automatic retry, only a link to My listings', async (_name, answer) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const requests = answerCreate(answer);
      await openCreate();
      await fill(user);
      await user.click(submit());
      // Past the 60 second upload timeout.
      await act(() => vi.advanceTimersByTimeAsync(61_000));
      const summary = await screen.findByRole('alert', { name: 'The listing was not saved' });
      expect(summary).toHaveTextContent(
        'We could not confirm whether your listing was saved. Check My listings before trying again.',
      );
      expect(within(summary).getByRole('link', { name: 'Go to My listings' })).toHaveAttribute(
        'href',
        '/farmer/listings',
      );
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      expect(requests).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('CreateListingScreen: photo picker', () => {
  it('announces preparation and readiness in a live region and shows a preview', async () => {
    /** @type {(value: ReturnType<typeof preparedPhoto>) => void} */
    let finish = () => {};
    vi.mocked(prepareImage).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await openCreate();
    pickPhoto(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    const status = screen.getByTestId('photo-status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    await waitFor(() => expect(status).toHaveTextContent('Preparing photo'));
    await act(async () => finish(preparedPhoto()));
    await waitFor(() => expect(status).toHaveTextContent('Photo ready, 240 kB'));
    expect(screen.getByRole('img', { name: 'Preview of the chosen photo' })).toBeInTheDocument();
  });

  it('shows the error for an unsupported file next to the photo', async () => {
    vi.mocked(prepareImage).mockRejectedValue(
      Object.assign(new Error('unsupported_type'), { code: 'unsupported_type' }),
    );
    await openCreate();
    pickPhoto(new File(['x'], 'a.gif', { type: 'image/gif' }), 'photo-camera-input');
    expect(await screen.findByTestId('photo-error')).toHaveTextContent(
      'Choose a JPEG or PNG photo. Other file types cannot be used.',
    );
  });

  it('has two keyboard operable buttons wired to the camera and gallery inputs', async () => {
    const user = userEvent.setup();
    await openCreate();
    const camera = /** @type {HTMLInputElement} */ (screen.getByTestId('photo-camera-input'));
    const gallery = /** @type {HTMLInputElement} */ (screen.getByTestId('photo-gallery-input'));
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(camera).toHaveAttribute('accept', 'image/jpeg,image/png');
    expect(gallery).not.toHaveAttribute('capture');
    expect(gallery).toHaveAttribute('accept', 'image/jpeg,image/png');
    const cameraClick = vi.spyOn(camera, 'click').mockImplementation(() => {});
    const galleryClick = vi.spyOn(gallery, 'click').mockImplementation(() => {});
    screen.getByRole('button', { name: 'Take a photo' }).focus();
    await user.keyboard('{Enter}');
    expect(cameraClick).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Choose from gallery' })).toHaveFocus();
    await user.keyboard(' ');
    expect(galleryClick).toHaveBeenCalledTimes(1);
  });

  it('revokes the preview URL when the photo is removed or replaced', async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    await openCreate();
    pickPhoto(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    await screen.findByText('Photo ready, 240 kB');
    const first = create.mock.results[0].value;
    pickPhoto(new File(['y'], 'b.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(first));
    await screen.findByText('Photo ready, 240 kB');
    const second = create.mock.results[1].value;
    await user.click(screen.getByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(second));
    expect(screen.getByTestId('photo-status')).toHaveTextContent('Photo removed.');
    expect(screen.getByRole('button', { name: 'Choose from gallery' })).toHaveFocus();
  });
});

describe('CreateListingScreen: unsaved changes and no markets', () => {
  it('warns on beforeunload only while the form is dirty', async () => {
    const user = userEvent.setup();
    await openCreate();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await user.type(screen.getByLabelText('Quantity (kg)'), '5');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('asks before leaving with unsaved changes (router blocker)', async () => {
    const user = userEvent.setup();
    const { router } = await openCreate();
    await user.type(screen.getByLabelText('Quantity (kg)'), '5');
    await user.click(
      within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', {
        name: 'Prices',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    await user.click(within(dialog).getByRole('button', { name: 'Stay on this page' }));
    expect(router.state.location.pathname).toBe('/farmer/listings/new');
    await user.click(
      within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', {
        name: 'Prices',
      }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Leave' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/farmer/prices'));
  });

  it('explains and disables the form when no market is available', async () => {
    server.use(http.get(apiUrl('/api/v1/markets'), () => HttpResponse.json([])));
    renderFarmer('/farmer/listings/new');
    expect(
      await screen.findByRole('heading', { name: 'No markets available' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'There are no markets with price data yet, so a listing cannot be created. Please check again soon.',
      ),
    ).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    expect(screen.getByLabelText('Market')).toBeDisabled();
  });

  it('does not request anything on load except markets and prices', async () => {
    const recorder = recordRequests();
    await openCreate('/farmer/listings/new?market=Nairobi');
    await waitFor(() =>
      expect(screen.getByTestId('price-guidance')).toHaveTextContent('KES 40.00'),
    );
    expect([...new Set(recorder.requests.map((r) => r.path))].sort()).toEqual([
      '/api/v1/forecasts',
      '/api/v1/markets',
      '/api/v1/prices/current',
    ]);
  });
});
