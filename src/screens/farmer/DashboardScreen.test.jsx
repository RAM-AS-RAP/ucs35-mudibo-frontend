import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import {
  apiUrl,
  errorResponse,
  forecastFor,
  forecastUnavailableResponse,
} from '@/test/msw/handlers';
import { logout } from '@/test/render';
import { recordRequests, renderFarmer } from '@/test/farmer';
import { setProfile } from '@/auth/session';
import { fixtures } from '@/test/fixtures';
import { queryClient } from '@/lib/queryClient';

afterEach(() => {
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
});

/** The card with an h3 `name` inside the section headed `section`. */
function cardIn(section, name) {
  const region = screen.getByRole('region', { name: section });
  return within(region).getByRole('heading', { name, level: 3 }).closest('[data-slot="card"]');
}

async function openDashboard() {
  const utils = renderFarmer('/farmer');
  await screen.findByRole('heading', { name: 'Dashboard', level: 1 });
  await waitFor(() =>
    expect(
      screen.queryAllByRole('status').filter((s) => /Loading/.test(s.textContent ?? '')),
    ).toEqual([]),
  );
  return utils;
}

describe('DashboardScreen', () => {
  it('greets the farmer and shows the freshness note once', async () => {
    renderFarmer('/farmer');
    setProfile(fixtures.userMe);
    expect(await screen.findByText(`Welcome, ${fixtures.userMe.name}`)).toBeInTheDocument();
    expect(screen.getAllByText('Prices are monthly figures from FEWS NET.')).toHaveLength(1);
  });

  it('issues its requests in parallel: markets, both crops, then both forecasts', async () => {
    const recorder = recordRequests();
    await openDashboard();
    const calls = recorder.requests.map((r) => `${r.path}?${new URLSearchParams(r.query)}`);
    expect(calls.sort()).toEqual([
      '/api/v1/forecasts?market=Nairobi&crop=beans&horizon=one_month',
      '/api/v1/forecasts?market=Nairobi&crop=maize&horizon=one_month',
      '/api/v1/markets?',
      '/api/v1/prices/current?crop=beans',
      '/api/v1/prices/current?crop=maize',
    ]);
    // The first three start together, before any answer arrives.
    expect(
      recorder.requests
        .slice(0, 3)
        .map((r) => r.path)
        .sort(),
    ).toEqual(['/api/v1/markets', '/api/v1/prices/current', '/api/v1/prices/current']);
  });

  it('lists the latest prices per crop with their changes and links', async () => {
    await openDashboard();
    const maize = cardIn('Latest prices', 'Maize');
    expect(maize).toHaveTextContent('NairobiKES 40.00 per kg');
    expect(maize).toHaveTextContent('+4.5% vs 1 month agoIncreasing');
    expect(maize).toHaveTextContent('No change data');
    expect(maize).toHaveTextContent('1 month older');
    expect(within(maize).getByRole('link', { name: 'See maize prices' })).toHaveAttribute(
      'href',
      '/farmer/prices?crop=maize',
    );
    const beans = cardIn('Latest prices', 'Beans');
    expect(beans).toHaveTextContent('KES 95.50');
    expect(beans).not.toHaveTextContent('older');
  });

  it('shows the one month forecast snapshot for the first market', async () => {
    await openDashboard();
    const region = screen.getByRole('region', { name: 'Forecast snapshot' });
    expect(region).toHaveTextContent('Market: Nairobi');
    expect(within(region).getByRole('link', { name: /^Change/ })).toHaveAttribute(
      'href',
      '/farmer/forecast',
    );
    const maize = cardIn('Forecast snapshot', 'Maize');
    expect(maize).toHaveTextContent('In 1 month');
    expect(maize).toHaveTextContent('KES 42.49 per kg');
    expect(maize).toHaveTextContent('+6.2%Increasing');
    expect(within(maize).getByRole('link', { name: 'See the maize forecast' })).toHaveAttribute(
      'href',
      '/farmer/forecast?market=Nairobi&crop=maize&horizon=one_month',
    );
  });

  it('replaces an unavailable forecast with "Not available yet"', async () => {
    server.use(
      http.get(apiUrl('/api/v1/forecasts'), ({ request }) => {
        const crop = new URL(request.url).searchParams.get('crop');
        return crop === 'beans'
          ? forecastUnavailableResponse('stale')
          : HttpResponse.json(forecastFor());
      }),
    );
    await openDashboard();
    expect(cardIn('Forecast snapshot', 'Beans')).toHaveTextContent('Not available yet');
    expect(cardIn('Forecast snapshot', 'Maize')).toHaveTextContent('KES 42.49');
  });

  it('a partial failure shows the other cards', async () => {
    server.use(
      http.get(apiUrl('/api/v1/prices/current'), ({ request }) => {
        const crop = new URL(request.url).searchParams.get('crop');
        return crop === 'beans'
          ? errorResponse(500, 'internal_error', { requestId: 'req-beans-500' })
          : HttpResponse.json(fixtures.currentPricesMaize);
      }),
    );
    await openDashboard();
    const beans = cardIn('Latest prices', 'Beans');
    expect(within(beans).getByRole('alert')).toHaveTextContent('Prices could not be loaded');
    expect(beans).toHaveTextContent('req-beans-500');
    expect(within(beans).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(cardIn('Latest prices', 'Maize')).toHaveTextContent('KES 40.00');
    expect(cardIn('Forecast snapshot', 'Beans')).toHaveTextContent('KES 42.49');
  });

  it('links to My listings', async () => {
    await openDashboard();
    expect(screen.getByRole('link', { name: /^My listings\s*See and manage/ })).toHaveAttribute(
      'href',
      '/farmer/listings',
    );
  });
});
