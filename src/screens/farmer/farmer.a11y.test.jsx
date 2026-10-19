// Accessibility and the relative time rule for the farmer price, trend and forecast screens,
// in every state: success, loading, empty, error, unavailable and inconsistent explanation.
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, forecastFor, forecastUnavailableResponse } from '@/test/msw/handlers';
import { expectNoAxeViolations } from '@/test/axe';
import { logout } from '@/test/render';
import {
  emptyPriceRoutes,
  failAllPriceRoutes,
  hangAllPriceRoutes,
  renderFarmer,
} from '@/test/farmer';
import { ABSOLUTE_TIME_PATTERNS, expectNoAbsoluteTime } from '@/test/userFacing';
import { queryClient } from '@/lib/queryClient';

afterEach(() => {
  logout();
  queryClient.clear();
});

const SCREENS = [
  { name: 'Dashboard', path: '/farmer' },
  { name: 'Prices', path: '/farmer/prices' },
  { name: 'Forecast', path: '/farmer/forecast' },
];

/** Wait until no loading status is left. */
async function settled() {
  await waitFor(() =>
    expect(
      screen.queryAllByRole('status').filter((s) => /Loading/.test(s.textContent ?? '')),
    ).toEqual([]),
  );
}

/**
 * Render a screen, wait for `ready`, then check axe and the relative time rule.
 * @param {string} path
 * @param {string} state
 * @param {() => Promise<unknown>} ready
 */
async function checkState(path, state, ready) {
  const utils = renderFarmer(path);
  await ready();
  await expectNoAxeViolations(utils.container, { page: true });
  expectNoAbsoluteTime(utils.container, `${path} (${state})`);
  for (const pattern of ABSOLUTE_TIME_PATTERNS) {
    expect(utils.router.state.location.search).not.toMatch(pattern);
  }
  return utils;
}

describe.each(SCREENS)('$name screen', ({ name, path }) => {
  const heading = () => screen.findByRole('heading', { name, level: 1 });

  it('success', async () => {
    await checkState(path, 'success', async () => {
      await heading();
      await settled();
    });
  });

  it('loading', async () => {
    hangAllPriceRoutes();
    await checkState(path, 'loading', async () => {
      await heading();
      expect(await screen.findAllByText(/^Loading/)).not.toHaveLength(0);
    });
  });

  it('empty', async () => {
    emptyPriceRoutes();
    await checkState(path, 'empty', async () => {
      await heading();
      expect(
        await screen.findAllByText('Prices are not available yet. Please check again soon.'),
      ).not.toHaveLength(0);
    });
  });

  it('error', async () => {
    failAllPriceRoutes('req-farmer-error');
    await checkState(path, 'error', async () => {
      await heading();
      expect(await screen.findAllByText('req-farmer-error')).not.toHaveLength(0);
      expect(screen.getAllByRole('button', { name: 'Try again' })).not.toHaveLength(0);
    });
  });
});

describe('forecast states', () => {
  it('unavailable (no_forecast and stale) on the forecast screen and the dashboard', async () => {
    server.use(
      http.get(apiUrl('/api/v1/forecasts'), ({ request }) =>
        forecastUnavailableResponse(
          new URL(request.url).searchParams.get('horizon') === 'one_month'
            ? 'no_forecast'
            : 'stale',
        ),
      ),
    );
    const forecast = await checkState('/farmer/forecast', 'unavailable', async () => {
      await screen.findByText(/A forecast is not available yet/);
      await settled();
    });
    forecast.unmount();
    await checkState('/farmer', 'unavailable', async () => {
      await waitFor(() => expect(screen.getAllByText('Not available yet')).toHaveLength(2));
      await settled();
    });
  });

  it('inconsistent explanation', async () => {
    server.use(
      http.get(apiUrl('/api/v1/forecasts'), () => {
        const forecast = forecastFor();
        forecast.shap_values.groups[1].direction = 'sideways';
        return HttpResponse.json(forecast);
      }),
    );
    await checkState('/farmer/forecast', 'inconsistent explanation', async () => {
      await screen.findByText('The explanation for this forecast is not available right now.');
      await settled();
    });
  });

  it('the lagging market also passes on the prices screen with one market', async () => {
    await checkState('/farmer/prices?markets=Kisumu&range=12', 'one lagging market', async () => {
      await screen.findByRole('img', { name: /^Maize in Kisumu/ });
    });
  });
});

describe('keyboard operation', () => {
  it('moves through a segmented control with the arrow keys', async () => {
    renderFarmer('/farmer/forecast');
    await screen.findByText(/Expected in 1 month/);
    const user = userEvent.setup();
    const oneMonth = screen.getByRole('radio', { name: '1 month' });
    oneMonth.focus();
    await user.keyboard('{ArrowRight}');
    const twoMonths = screen.getByRole('radio', { name: '2 months' });
    expect(twoMonths).toBeChecked();
    expect(twoMonths).toHaveFocus();
    expect(await screen.findByText(/Expected in 2 months/)).toBeInTheDocument();
  });

  it('toggles market chips with Space and Enter', async () => {
    renderFarmer('/farmer/prices');
    await screen.findByRole('img', { name: /Maize in Nairobi/ });
    const user = userEvent.setup();
    const kisumu = screen.getByRole('button', { name: 'Kisumu' });
    kisumu.focus();
    await user.keyboard(' ');
    expect(kisumu).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard('{Enter}');
    expect(kisumu).toHaveAttribute('aria-pressed', 'true');
  });

  it('reaches the horizon cards and the details summaries with Tab', async () => {
    renderFarmer('/farmer/forecast');
    await screen.findByText(/Expected in 1 month/);
    const user = userEvent.setup();
    const twoCard = screen.getByRole('button', { name: /^In 2 months/ });
    for (let i = 0; i < 40 && document.activeElement !== twoCard; i += 1) await user.tab();
    expect(twoCard).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(twoCard).toHaveAttribute('aria-current', 'true');
    // Every "details" element starts with its summary, the native keyboard control.
    for (const details of document.querySelectorAll('details')) {
      expect(details.firstElementChild?.tagName).toBe('SUMMARY');
    }
  });

  it('moves focus to the heading on a route change, not on a selection change', async () => {
    renderFarmer('/farmer');
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });
    const user = userEvent.setup();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    await user.click(within(nav).getByRole('link', { name: 'Prices' }));
    const heading = await screen.findByRole('heading', { name: 'Prices', level: 1 });
    await waitFor(() => expect(heading).toHaveFocus());
    const range = await screen.findByRole('radio', { name: '12 months' });
    await user.click(range);
    expect(range).toHaveFocus();
  });
});
