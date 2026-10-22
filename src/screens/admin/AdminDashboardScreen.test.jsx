import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { recordAll } from '@/test/buyer';
import { renderAdmin, setWideScreen, waitForScreen } from '@/test/admin';
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

async function openDashboard() {
  const utils = renderAdmin('/admin');
  await waitForScreen('Dashboard', 'Loading the dashboard…');
  return utils;
}

/** @param {Record<string, unknown>} change */
function serveStats(change) {
  server.use(
    http.get(apiUrl('/api/v1/admin/stats'), () =>
      HttpResponse.json({ ...structuredClone(fixtures.adminStats), ...change }),
    ),
  );
}

/** @param {string} testId */
const countsIn = (testId) =>
  Object.fromEntries(
    [...screen.getByTestId(testId).querySelectorAll('[data-status-count]')].map((row) => [
      row.getAttribute('data-status-count'),
      row.querySelector('dd')?.textContent,
    ]),
  );

describe('AdminDashboardScreen', () => {
  it('makes one request and shows every status with zero when absent', async () => {
    await openDashboard();
    expect(recorder.of('GET', '/api/v1/admin/stats')).toHaveLength(1);
    expect(countsIn('listing-counts')).toEqual({ active: '9', sold_out: '3', removed: '0' });
    expect(countsIn('order-counts')).toEqual({
      needs_reconciliation: '1',
      pending_payment: '2',
      paid: '14',
      payment_failed: '0',
      expired: '5',
      cancelled: '0',
    });
    expect(countsIn('payment-counts')).toEqual({
      initiating: '0',
      initiated: '1',
      completed: '14',
      failed: '2',
      cancelled: '0',
      timeout: '0',
    });
    const users = screen.getByTestId('user-counts');
    for (const [label, value] of [
      ['Farmers', '12'],
      ['Buyers', '30'],
      ['Admins', '2'],
      ['Disabled accounts', '1'],
    ]) {
      expect(within(users).getByText(label).closest('div')?.parentElement).toHaveTextContent(value);
    }
  });

  it('labels the completed amount as test money', async () => {
    await openDashboard();
    expect(screen.getByText('KES 48,250.00')).toBeInTheDocument();
    expect(screen.getByText('Test environment amounts. No real money.')).toBeInTheDocument();
  });

  it('links what needs attention to the filtered lists', async () => {
    await openDashboard();
    expect(screen.getByText('1 order needs review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review orders' })).toHaveAttribute(
      'href',
      '/admin/orders?status=needs_reconciliation',
    );
    expect(
      screen.getByText('1 payment has waited more than 10 minutes for the phone'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View waiting payments' })).toHaveAttribute(
      'href',
      '/admin/payments?status=initiated',
    );
  });

  it('says "Nothing needs attention." when both counts are zero', async () => {
    serveStats({
      attention: { orders_needing_reconciliation: 0, payments_initiated_over_10_minutes: 0 },
    });
    await openDashboard();
    expect(screen.getByText('Nothing needs attention.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review orders' })).toBeNull();
  });

  it('shows the pipeline table with "Current" and "Out of date" and the run times', async () => {
    setWideScreen(true);
    await openDashboard();
    const table = screen.getByRole('table', {
      name: 'Latest prices and forecasts per market and crop',
    });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Nairobi, Maize');
    expect(rows[0]).toHaveTextContent('August 2026');
    expect(within(rows[0]).getByText('Current')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Kisumu, Beans');
    expect(rows[1]).toHaveTextContent('July 2026');
    expect(within(rows[1]).getByText('Out of date')).toBeInTheDocument();
    expect(
      screen.getByText('A forecast is current when it is based on the latest published price.'),
    ).toBeInTheDocument();
    const times = screen.getByTestId('pipeline-times');
    expect(times).toHaveTextContent('Prices last fetched');
    expect(times).toHaveTextContent('20 Oct 2026, 06:00');
    expect(times).toHaveTextContent('20 Oct 2026, 06:15');
  });

  it('shows "No price data yet." for an empty pipeline', async () => {
    serveStats({
      pipeline: { series: [], last_prices_fetch: null, last_forecast_generated: null },
    });
    await openDashboard();
    expect(screen.getByText('No price data yet.')).toBeInTheDocument();
    expect(screen.getByTestId('pipeline-times')).toHaveTextContent('Never');
  });

  it('shows one ErrorState for the whole page with the reference and retries', async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      http.get(apiUrl('/api/v1/admin/stats'), () =>
        fail
          ? errorResponse(500, 'internal_error', { requestId: 'req-stats' })
          : HttpResponse.json(fixtures.adminStats),
      ),
    );
    renderAdmin('/admin');
    expect(await screen.findByText('The dashboard could not be loaded')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('req-stats')).toBeInTheDocument();
    expect(screen.queryByText('Needs attention')).toBeNull();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
  });

  it('refreshes with the Refresh button and never polls', async () => {
    const user = userEvent.setup();
    await openDashboard();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await vi.waitFor(() => expect(recorder.of('GET', '/api/v1/admin/stats')).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 300));
    expect(recorder.of('GET', '/api/v1/admin/stats')).toHaveLength(2);
  });
});
