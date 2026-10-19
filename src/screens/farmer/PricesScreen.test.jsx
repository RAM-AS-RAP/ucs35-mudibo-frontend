import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, trendFor } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { recordRequests, renderFarmer } from '@/test/farmer';
import { queryClient } from '@/lib/queryClient';

afterEach(() => {
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
});

/** Wait for the screen, the latest price cards and the trend chart or table. */
async function openPrices(path = '/farmer/prices') {
  const utils = renderFarmer(path);
  await screen.findByRole('heading', { name: 'Prices', level: 1 });
  await screen.findByRole('heading', { name: 'Nairobi', level: 3 });
  await screen.findByRole('table');
  return utils;
}

/** The latest price card of a market. @param {string} market */
const card = (market) => screen.getByRole('heading', { name: market, level: 3 }).closest('article');

/** The rows of the trend table as [period, ...prices]. */
function tableRows() {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent));
}

describe('PricesScreen: latest prices', () => {
  it('shows a card for each market with price, bag line and change', async () => {
    await openPrices();
    const nairobi = screen.getByRole('heading', { name: 'Nairobi', level: 3 }).closest('article');
    const kisumu = screen.getByRole('heading', { name: 'Kisumu', level: 3 }).closest('article');
    expect(nairobi).toHaveTextContent('Latest price');
    expect(nairobi).toHaveTextContent('KES 40.00per kg');
    expect(nairobi).toHaveTextContent('About KES 3,600 per 90 kg bag');
    expect(nairobi).toHaveTextContent('+4.5% vs 1 month agoIncreasing');
    expect(kisumu).toHaveTextContent('KES 37.50');
  });

  it('shows "No change data" for a null change_pct, never NaN', async () => {
    await openPrices();
    const kisumu = screen.getByRole('heading', { name: 'Kisumu', level: 3 }).closest('article');
    expect(kisumu).toHaveTextContent('No change data');
    expect(document.body.textContent).not.toMatch(/NaN|undefined|null/);
  });

  it('tags only the lagging market "1 month older"', async () => {
    await openPrices();
    const nairobi = screen.getByRole('heading', { name: 'Nairobi', level: 3 }).closest('article');
    const kisumu = screen.getByRole('heading', { name: 'Kisumu', level: 3 }).closest('article');
    expect(kisumu).toHaveTextContent('1 month older');
    expect(nairobi).not.toHaveTextContent('older');
  });

  it('shows the freshness note but not the backend as_of_note', async () => {
    await openPrices();
    expect(screen.getByText('Prices are monthly figures from FEWS NET.')).toBeInTheDocument();
    expect(screen.queryByText(fixtures.currentPricesMaize.as_of_note)).not.toBeInTheDocument();
  });

  it('switching the crop refetches and shows beans prices', async () => {
    const recorder = recordRequests();
    await openPrices();
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Beans' }));
    await waitFor(() => expect(card('Nairobi')).toHaveTextContent('KES 95.50'));
    expect(
      recorder.requests.filter((r) => r.path === '/api/v1/prices/current').map((r) => r.query.crop),
    ).toEqual(['maize', 'beans']);
    // Beans: Kisumu +0.2% is little change, Nairobi -2.6% is falling.
    const kisumu = screen.getByRole('heading', { name: 'Kisumu', level: 3 }).closest('article');
    expect(kisumu).toHaveTextContent('+0.2% vs 1 month agoLittle change');
    const nairobi = screen.getByRole('heading', { name: 'Nairobi', level: 3 }).closest('article');
    expect(nairobi).toHaveTextContent('-2.6% vs 1 month agoFalling');
  });
});

describe('PricesScreen: trend', () => {
  it('selects all markets by default and requests their trends in parallel', async () => {
    const recorder = recordRequests();
    await openPrices();
    const trendCalls = recorder.requests.filter((r) => r.path === '/api/v1/prices/trends');
    expect(trendCalls.map((r) => r.query)).toEqual(
      expect.arrayContaining([
        { market: 'Nairobi', crop: 'maize', months: '24' },
        { market: 'Kisumu', crop: 'maize', months: '24' },
      ]),
    );
    for (const name of ['Nairobi', 'Kisumu']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('keeps at least one market selected', async () => {
    const { router } = await openPrices();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Kisumu' }));
    expect(screen.getByRole('button', { name: 'Kisumu' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Nairobi' }));
    expect(screen.getByRole('button', { name: 'Nairobi' })).toHaveAttribute('aria-pressed', 'true');
    expect(new URLSearchParams(router.state.location.search).get('markets')).toBe('Nairobi');
    await waitFor(() =>
      expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
        'Period',
        'Nairobi (KES per kg)',
      ]),
    );
  });

  it('the range control changes the number of plotted months', async () => {
    await openPrices('/farmer/prices?markets=Nairobi');
    // 24 months of Nairobi maize, ending at the latest month.
    expect(tableRows()).toHaveLength(24);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: '12 months' }));
    await waitFor(() => expect(tableRows()).toHaveLength(12));
    await user.click(screen.getByRole('radio', { name: 'All (up to 60)' }));
    await waitFor(() => expect(tableRows()).toHaveLength(60));
  });

  it('has a chart with a text alternative and the data table, newest row last', async () => {
    await openPrices('/farmer/prices?range=12');
    const chart = screen.getByRole('img', { name: /^Maize in Nairobi, 11 months of prices\./ });
    expect(chart.getAttribute('aria-label')).toContain(
      'Maize in Kisumu, 11 months of prices. Latest KES 37.50, 1 month ago.',
    );
    expect(screen.getByText('See the numbers')).toBeInTheDocument();
    const rows = tableRows();
    expect(rows.at(-1)).toEqual(['Latest', 'KES 40.00', 'No price']);
    expect(rows.at(-2)).toEqual(['1 month ago', 'KES 38.28', 'KES 37.50']);
  });

  it('leaves a gap in the data as a gap', async () => {
    await openPrices('/farmer/prices?range=12&markets=Nairobi');
    const gap = tableRows().find((row) => row[0] === '5 months ago');
    expect(gap).toEqual(['5 months ago', 'No price']);
  });

  it('shows the table and a note instead of a chart for fewer than 3 points', async () => {
    server.use(
      http.get(apiUrl('/api/v1/prices/trends'), ({ request }) => {
        const market = new URL(request.url).searchParams.get('market') ?? '';
        const trend = trendFor({ market, crop: 'maize', months: 2 });
        return HttpResponse.json(trend);
      }),
    );
    await openPrices('/farmer/prices?markets=Nairobi');
    expect(
      screen.getByText(
        'There are not enough prices yet to draw a chart. The numbers are in the table.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(tableRows()).toEqual([
      ['1 month ago', 'KES 38.28'],
      ['Latest', 'KES 40.00'],
    ]);
  });
});

describe('PricesScreen: URL', () => {
  it('initialises the controls from the URL', async () => {
    await openPrices('/farmer/prices?crop=beans&range=12&markets=Kisumu');
    expect(screen.getByRole('radio', { name: 'Beans' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '12 months' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Kisumu' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Nairobi' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('falls back to the defaults for invalid values and cleans the URL', async () => {
    const { router } = await openPrices('/farmer/prices?crop=rice&range=7&markets=Mombasa');
    expect(screen.getByRole('radio', { name: 'Maize' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '24 months' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Nairobi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Kisumu' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('keeps focus on the control when a selection changes the URL', async () => {
    await openPrices();
    const user = userEvent.setup();
    const beans = screen.getByRole('radio', { name: 'Beans' });
    await user.click(beans);
    await waitFor(() => expect(card('Nairobi')).toHaveTextContent('KES 95.50'));
    expect(beans).toHaveFocus();
  });
});
