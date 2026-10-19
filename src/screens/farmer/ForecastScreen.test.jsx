import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { expectNoAbsoluteTime } from '@/test/userFacing';
import { getSession } from '@/auth/session';
import { queryClient } from '@/lib/queryClient';

afterEach(() => {
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
});

/**
 * Answer the forecast route per horizon.
 * @param {Partial<Record<'one_month' | 'two_month', () => Response>>} byHorizon
 */
function forecastRoute(byHorizon) {
  server.use(
    http.get(apiUrl('/api/v1/forecasts'), ({ request }) => {
      const query = new URL(request.url).searchParams;
      const horizon = /** @type {'one_month' | 'two_month'} */ (query.get('horizon'));
      const respond = byHorizon[horizon];
      if (respond) return respond();
      return HttpResponse.json(
        forecastFor({
          market: query.get('market') ?? 'Nairobi',
          crop: query.get('crop') ?? 'maize',
          horizon,
        }),
      );
    }),
  );
}

/** Open the forecast screen and wait for its headline price. */
async function openForecast(path = '/farmer/forecast', text = 'Expected in') {
  const utils = renderFarmer(path);
  await screen.findByRole('heading', { name: 'Forecast', level: 1 });
  await screen.findByText(new RegExp(text));
  return utils;
}

const headline = () => screen.getByTestId('forecast-headline');
const horizonCard = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('ForecastScreen: headline and horizons', () => {
  it('shows the formatted headline without float artefacts or an updated time', async () => {
    const { container } = await openForecast();
    const card = headline();
    expect(card).toHaveTextContent('KES 42.49per kg');
    expect(card).toHaveTextContent('About KES 3,820 per 90 kg bag');
    expect(card).toHaveTextContent('+6.2%Increasing');
    expect(card).toHaveTextContent(
      'Expected in 1 month, starting from the latest price of KES 40.00 per kg.',
    );
    expect(screen.getByRole('heading', { name: 'Maize in Nairobi, in 1 month' })).toBeVisible();
    expect(container.textContent).not.toMatch(/Updated|\d\.\d{3,}/);
    expectNoAbsoluteTime(container, 'success');
  });

  it('requests both horizons in parallel', async () => {
    const recorder = recordRequests();
    await openForecast();
    const horizons = recorder.requests
      .filter((r) => r.path === '/api/v1/forecasts')
      .map((r) => r.query.horizon)
      .sort();
    expect(horizons).toEqual(['one_month', 'two_month']);
  });

  it('labels the horizon cards and marks the selected one', async () => {
    await openForecast();
    const one = horizonCard('In 1 month');
    const two = horizonCard('In 2 months');
    expect(one).toHaveAttribute('aria-current', 'true');
    expect(two).not.toHaveAttribute('aria-current');
    expect(one).toHaveTextContent('KES 42.49');
    expect(two).toHaveTextContent('KES 38.60');
    expect(screen.getByRole('radio', { name: '1 month' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '2 months' })).not.toBeChecked();
  });

  it('switching the horizon changes the explanation without refetching', async () => {
    const recorder = recordRequests();
    const { router } = await openForecast();
    const user = userEvent.setup();
    await user.click(horizonCard('In 2 months'));
    await waitFor(() =>
      expect(headline()).toHaveTextContent(
        'Expected in 2 months, starting from the latest price of KES 40.00 per kg.',
      ),
    );
    expect(horizonCard('In 2 months')).toHaveAttribute('aria-current', 'true');
    expect(new URLSearchParams(router.state.location.search).get('horizon')).toBe('two_month');
    const rows = screen.getAllByRole('listitem').filter((li) => li.dataset.row === 'group');
    expect(rows.map((li) => li.dataset.effect)).toEqual(['Drag', 'Drag', 'Drag']);
    expect(
      recorder.requests.filter((r) => r.path === '/api/v1/forecasts').map((r) => r.query.horizon),
    ).toHaveLength(2);
  });
});

describe('ForecastScreen: recommendation', () => {
  it('rise', async () => {
    await openForecast();
    const box = screen.getByRole('heading', { name: 'The model expects the price to rise' });
    const section = box.closest('section');
    expect(section).toHaveAttribute('data-tone', 'rise');
    expect(section).toHaveClass('bg-positive-soft');
    expect(section).toHaveTextContent(
      'The forecast is for the price to rise by about 6.2% in 1 month.',
    );
    expect(section).toHaveTextContent('Forecasts are estimates and can be wrong.');
    expect(
      screen.getByText('Forecasts look ahead from the latest published prices.'),
    ).toBeInTheDocument();
  });

  it('fall', async () => {
    await openForecast('/farmer/forecast?horizon=two_month');
    const section = screen
      .getByRole('heading', { name: 'The model expects the price to fall' })
      .closest('section');
    expect(section).toHaveClass('bg-negative-soft');
    expect(section).toHaveTextContent(
      'The forecast is for the price to fall by about 3.5% in 2 months.',
    );
  });

  it('flat', async () => {
    forecastRoute({
      one_month: () =>
        HttpResponse.json({ ...forecastFor(), predicted_price: 40.2, expected_change_pct: 0.5 }),
    });
    await openForecast();
    const section = screen
      .getByRole('heading', { name: 'The model expects little change' })
      .closest('section');
    expect(section).toHaveClass('bg-neutral-bg');
    expect(section).toHaveTextContent(
      'Choose when to sell based on your own needs and the offers you receive.',
    );
    expect(headline()).toHaveTextContent('+0.5%Little change');
  });
});

describe('ForecastScreen: explanation', () => {
  it('shows the typical change, Boost and Drag rows with their colours, the total and the note', async () => {
    await openForecast();
    const items = screen.getAllByRole('listitem');
    const typical = items.find((li) => li.dataset.row === 'typical');
    expect(typical).toHaveTextContent('Typical change for this market and crop: +0.7%');
    const groups = items.filter((li) => li.dataset.row === 'group');
    expect(groups.map((li) => li.dataset.effect)).toEqual(['Boost', 'Boost', 'Drag']);
    expect(groups[0]).toHaveTextContent('Time of year');
    expect(groups[0]).toHaveTextContent('Boost+3.6%(about +KES 1.42 per kg)');
    expect(groups[2]).toHaveTextContent('Drag-1.2%(about -KES 0.48 per kg)');
    expect(groups[0].querySelector('[data-bar]')).toHaveClass(
      'bg-positive-soft',
      'border-positive',
    );
    expect(groups[2].querySelector('[data-bar]')).toHaveClass(
      'bg-negative-soft',
      'border-negative',
    );
    expect(groups[0].querySelector('[data-bar]')?.parentElement?.parentElement).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    const total = items.find((li) => li.dataset.row === 'total');
    expect(total).toHaveTextContent('Expected change+6.2%, to KES 42.49 per kg');
    expect(
      screen.getByText(
        'The bars show how the model reached this forecast. They are approximate shares and do not add up exactly. They do not prove why prices move.',
      ),
    ).toBeInTheDocument();
  });

  it('has a text alternative and the numbers table', async () => {
    await openForecast();
    const figure = screen.getByRole('figure');
    expect(figure).toHaveAccessibleName(
      'Forecast for 1 month ahead: KES 42.49 per kg, up 6.2% from the latest price of KES 40.00. Time of year adds about KES 1.42, recent price momentum adds about KES 1.22, and price compared with its recent average takes away about KES 0.48.',
    );
    const table = screen.getByRole('table', { name: 'How the model reached the forecast' });
    const cell = within(table).getByRole('rowheader', { name: 'Time of year (Boost)' });
    // Closed until the "See the numbers" details element is opened.
    expect(cell).not.toBeVisible();
    const summary = within(screen.getByRole('figure').parentElement).getByText('See the numbers');
    await userEvent.setup().click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(cell).toBeVisible();
    expect(screen.getByText('How to read this')).toBeInTheDocument();
  });

  it('draws the bars when the headline log change is rounded to 2 decimals', async () => {
    forecastRoute({
      one_month: () => {
        const forecast = forecastFor();
        forecast.predicted_log_change = Number(forecast.predicted_log_change.toFixed(2));
        forecast.shap_values.groups[0].log_contribution += 0.01;
        return HttpResponse.json(forecast);
      },
    });
    await openForecast();
    expect(headline()).toHaveTextContent('KES 42.49');
    expect(screen.getByRole('figure')).toBeInTheDocument();
    expect(
      screen.queryByText('The explanation for this forecast is not available right now.'),
    ).not.toBeInTheDocument();
  });

  it('hides the bars for a malformed explanation but keeps the price', async () => {
    forecastRoute({
      one_month: () => {
        const forecast = forecastFor();
        delete forecast.shap_values.groups;
        return HttpResponse.json(forecast);
      },
    });
    const { container } = await openForecast();
    expect(headline()).toHaveTextContent('KES 42.49');
    expect(
      screen.getByText('The explanation for this forecast is not available right now.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(screen.queryByText('Boost')).not.toBeInTheDocument();
    expectNoAbsoluteTime(container, 'malformed explanation');
  });
});

describe('ForecastScreen: unavailable', () => {
  it('no_forecast: the message, the current price and the other horizon', async () => {
    forecastRoute({ one_month: () => forecastUnavailableResponse('no_forecast') });
    const { container } = await openForecast('/farmer/forecast', 'A forecast is not available');
    expect(
      screen.getByText(
        'A forecast is not available yet for Nairobi maize. We forecast only from the latest published prices. Please check again soon.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Nairobi', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See maize prices' })).toHaveAttribute(
      'href',
      '/farmer/prices?crop=maize',
    );
    expect(horizonCard('In 1 month')).toHaveTextContent('Not available yet');
    expect(horizonCard('In 2 months')).toHaveTextContent('KES 38.60');
    expect(screen.queryByText(/The model expects/)).not.toBeInTheDocument();
    expectNoAbsoluteTime(container, 'unavailable');
  });

  it('stale: the out of date message', async () => {
    forecastRoute({ two_month: () => forecastUnavailableResponse('stale') });
    await openForecast('/farmer/forecast?horizon=two_month', 'out of date');
    expect(
      screen.getByText(
        'The latest forecast for Nairobi maize is out of date because new prices have not been published yet. Please check again soon.',
      ),
    ).toBeInTheDocument();
    expect(horizonCard('In 1 month')).toHaveTextContent('KES 42.49');
  });

  it('a market without data shows the error with its reference', async () => {
    forecastRoute({
      one_month: () =>
        errorResponse(404, 'market_not_available', { requestId: 'req-market-missing' }),
    });
    await openForecast('/farmer/forecast', 'No price data for this market yet.');
    expect(screen.getByText('req-market-missing')).toBeInTheDocument();
  });
});

describe('ForecastScreen: URL, next step and session', () => {
  it('initialises the controls from the URL', async () => {
    await openForecast('/farmer/forecast?market=Kisumu&crop=beans&horizon=two_month');
    expect(screen.getByRole('combobox', { name: 'Market' })).toHaveValue('Kisumu');
    expect(screen.getByRole('radio', { name: 'Beans' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '2 months' })).toBeChecked();
    expect(screen.getByRole('heading', { name: 'Beans in Kisumu, in 2 months' })).toBeVisible();
  });

  it('falls back to the defaults for invalid parameters', async () => {
    const { router } = await openForecast(
      '/farmer/forecast?market=Atlantis&crop=rice&horizon=soon',
    );
    expect(screen.getByRole('combobox', { name: 'Market' })).toHaveValue('Nairobi');
    expect(screen.getByRole('radio', { name: 'Maize' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '1 month' })).toBeChecked();
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('updates the URL from the controls', async () => {
    const { router } = await openForecast();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Market' }), 'Kisumu');
    await user.click(screen.getByRole('radio', { name: 'Beans' }));
    await waitFor(() =>
      expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({
        market: 'Kisumu',
        crop: 'beans',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Beans in Kisumu, in 1 month' }),
    ).toBeVisible();
  });

  it('links "Plan a listing" with the crop and market', async () => {
    await openForecast('/farmer/forecast?market=Kisumu&crop=beans');
    expect(screen.getByRole('link', { name: 'Plan a listing' })).toHaveAttribute(
      'href',
      '/farmer/listings/new?crop=beans&market=Kisumu',
    );
    expect(screen.getByText('You choose the price you ask for.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'These forecasts use monthly prices published by FEWS NET. A model trained on past prices can be wrong, especially after sudden events.',
      ),
    ).toBeInTheDocument();
  });

  it('a 401 clears the session and goes to the login screen', async () => {
    server.use(
      http.get(apiUrl('/api/v1/forecasts'), () => errorResponse(401, 'invalid_credentials')),
    );
    const { router } = renderFarmer('/farmer/forecast');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(getSession()).toBeNull();
  });
});
