import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { recordAll } from '@/test/buyer';
import { renderAdmin, setWideScreen, waitForScreen } from '@/test/admin';
import { BROKEN_VALUE_PATTERNS, collectUserFacingStrings } from '@/test/userFacing';
import { queryClient } from '@/lib/queryClient';

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
});

const listRequests = () =>
  recorder.of('GET', '/api/v1/admin/forecast-accuracy').map((r) => r.query);

async function openAccuracy(path = '/admin/forecast-accuracy') {
  const utils = renderAdmin(path);
  await waitForScreen('Forecast accuracy', 'Loading forecast accuracy…');
  return utils;
}

describe('ForecastAccuracyScreen', () => {
  it('shows one summary card per horizon and source, with "Not enough data" for missing values', async () => {
    await openAccuracy();
    const cards = screen.getAllByTestId('accuracy-summary');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole('heading')).toHaveTextContent(
      '1 month ahead, live forecasts',
    );
    expect(cards[0]).toHaveTextContent('Compared1');
    expect(cards[0]).toHaveTextContent('1.9%');
    expect(cards[0]).toHaveTextContent('KES 0.80');
    expect(cards[0]).toHaveTextContent('100.0%');
    expect(within(cards[1]).getByRole('heading')).toHaveTextContent(
      '2 months ahead, backfilled forecasts',
    );
    expect(within(cards[1]).getAllByText('Not enough data')).toHaveLength(4);
    const strings = collectUserFacingStrings(document.body);
    for (const pattern of BROKEN_VALUE_PATTERNS) {
      expect(strings.filter((s) => pattern.test(s))).toEqual([]);
    }
  });

  it('explains each measure and shows the API note', async () => {
    await openAccuracy();
    const details = screen.getByTestId('what-these-mean');
    expect(details.tagName).toBe('DETAILS');
    expect(details).toHaveTextContent('What these mean');
    expect(details).toHaveTextContent(
      'Backfilled forecasts were computed afterwards from the prices available at the time. They were never shown to farmers live.',
    );
    expect(details).toHaveTextContent(
      'The samples are small, so these figures are indicative only.',
    );
    expect(details).toHaveTextContent('Direction correct');
    expect(details).toHaveTextContent('the price stays the same');
    expect(screen.getByTestId('accuracy-note')).toHaveTextContent(fixtures.forecastAccuracy.note);
  });

  it('lists forecasts with months, prices, Yes or No, Pending and the source tag', async () => {
    setWideScreen(true);
    await openAccuracy();
    const table = screen.getByRole('table', { name: 'Forecasts and outcomes' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Nairobi, Maize, 1 month');
    expect(rows[0]).toHaveTextContent('June 2026');
    expect(rows[0]).toHaveTextContent('July 2026');
    expect(rows[0]).toHaveTextContent('KES 42.00');
    expect(rows[0]).toHaveTextContent('1.9%');
    expect(within(rows[0]).getAllByText('Yes')).toHaveLength(2);
    expect(within(rows[0]).getByText('Live')).toBeInTheDocument();
    expect(within(rows[1]).getAllByText('No')).toHaveLength(2);
    expect(within(rows[1]).getByText('Backfill')).toBeInTheDocument();
    expect(within(rows[2]).getAllByText('Pending').length).toBeGreaterThanOrEqual(3);
    expect(rows[0].querySelector('[data-yes-no="yes"] svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('maps the filters to the request, including is_backfill and include_pending', async () => {
    const user = userEvent.setup();
    const { router } = await openAccuracy();
    expect(listRequests()[0]).toEqual({ include_pending: 'true', limit: '20', offset: '0' });
    await waitFor(() =>
      expect(within(screen.getByLabelText('Market')).getAllByRole('option')).toHaveLength(3),
    );
    await user.selectOptions(screen.getByLabelText('Market'), 'Nairobi');
    await user.click(screen.getByRole('radio', { name: 'Maize' }));
    await user.click(screen.getByRole('radio', { name: '1 month' }));
    await user.click(screen.getByRole('radio', { name: 'Backfill' }));
    await user.click(screen.getByRole('switch', { name: 'Include pending' }));
    await waitFor(() =>
      expect(listRequests().at(-1)).toEqual({
        market: 'Nairobi',
        crop: 'maize',
        horizon: 'one_month',
        is_backfill: 'true',
        include_pending: 'false',
        limit: '20',
        offset: '0',
      }),
    );
    expect(router.state.location.search).toBe(
      '?market=Nairobi&crop=maize&horizon=one_month&source=backfill&pending=no',
    );
    await user.click(screen.getByRole('radio', { name: 'Live' }));
    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ is_backfill: 'false' }));
  });

  it('leaves out pending forecasts when "Include pending" is off', async () => {
    const user = userEvent.setup();
    await openAccuracy();
    expect(screen.getByTestId('list-count')).toHaveTextContent('Showing 3 of 3');
    await user.click(screen.getByRole('switch', { name: 'Include pending' }));
    await waitFor(() =>
      expect(screen.getByTestId('list-count')).toHaveTextContent('Showing 2 of 2'),
    );
  });

  it('shows the empty state and still the explanations', async () => {
    server.use(
      http.get(apiUrl('/api/v1/admin/forecast-accuracy'), () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0, summary: [], note: '' }),
      ),
    );
    await openAccuracy();
    expect(screen.getByText('No forecasts to compare yet')).toBeInTheDocument();
    expect(screen.getByTestId('what-these-mean')).toBeInTheDocument();
    expect(screen.queryAllByTestId('accuracy-summary')).toHaveLength(0);
  });

  it('draws no chart', async () => {
    const { container } = await openAccuracy();
    expect(container.querySelector('.recharts-wrapper, svg.recharts-surface, canvas')).toBeNull();
  });
});
