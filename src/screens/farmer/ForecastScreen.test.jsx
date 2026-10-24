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
 * Answer the forecast route per horizon (the screen asks only for one_month).
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

/** Open the forecast screen without asking for a forecast. */
async function openScreen(path = '/farmer/forecast') {
  const utils = renderFarmer(path);
  await screen.findByRole('heading', { name: 'Forecast', level: 1 });
  await screen.findByRole('combobox', { name: 'Market' });
  return utils;
}

/** The request button. */
const requestButton = () => screen.getByRole('button', { name: 'Request 1 month forecast' });
/** The button that opens the explanation. */
const whyButton = () => screen.getByRole('button', { name: 'Why the model expects this' });

/** Open the forecast screen, request the forecast and wait for `text`. */
async function openForecast(path = '/farmer/forecast', text = 'Expected in') {
  const utils = await openScreen(path);
  await userEvent.setup().click(requestButton());
  await screen.findByText(new RegExp(text));
  return utils;
}

/** Open the forecast screen, request the forecast and open the explanation. */
async function openExplanation(path = '/farmer/forecast') {
  const utils = await openForecast(path);
  await userEvent.setup().click(whyButton());
  return utils;
}

const headline = () => screen.getByTestId('forecast-headline');

describe('ForecastScreen: headline and horizon', () => {
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

  it('requests only the 1 month forecast', async () => {
    const recorder = recordRequests();
    await openForecast();
    const horizons = recorder.requests
      .filter((r) => r.path === '/api/v1/forecasts')
      .map((r) => r.query.horizon);
    expect(horizons).toEqual(['one_month']);
  });

  it('offers no 2 month forecast', async () => {
    await openForecast();
    expect(screen.queryByRole('radio', { name: '2 months' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Forecast for' })).not.toBeInTheDocument();
    expect(screen.queryByText('Compare the forecasts')).not.toBeInTheDocument();
    expect(screen.queryByText(/2 months/)).not.toBeInTheDocument();
  });

  it('removes a 2 month horizon from the URL and shows the 1 month forecast', async () => {
    const recorder = recordRequests();
    const { router } = await openForecast('/farmer/forecast?horizon=two_month');
    expect(headline()).toHaveTextContent('Expected in 1 month');
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(
      recorder.requests.filter((r) => r.path === '/api/v1/forecasts').map((r) => r.query.horizon),
    ).not.toContain('two_month');
  });
});

describe('ForecastScreen: request flow', () => {
  it('asks for no forecast until the farmer clicks the request button', async () => {
    const recorder = recordRequests();
    const { container } = await openScreen();
    expect(requestButton()).toBeEnabled();
    expect(screen.queryByTestId('forecast-headline')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Plan a listing' })).not.toBeInTheDocument();
    expect(recorder.requests.filter((r) => r.path === '/api/v1/forecasts')).toEqual([]);
    expectNoAbsoluteTime(container, 'before the request');

    await userEvent.setup().click(requestButton());
    await screen.findByText(/Expected in/);
    expect(recorder.requests.filter((r) => r.path === '/api/v1/forecasts')).toHaveLength(1);
  });

  it('keeps the explanation closed until "Why the model expects this" is clicked', async () => {
    await openForecast();
    const why = whyButton();
    expect(why).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(
      /** @type {string} */ (why.getAttribute('aria-controls')),
    );
    expect(panel).toContainElement(screen.getByRole('figure'));
    expect(screen.getByRole('heading', { name: 'Why the model expects this' })).toBeVisible();
    await user.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });

  it('shows no recommendation and no uncertainty box', async () => {
    const { container } = await openExplanation();
    expect(
      screen.queryByText(/The model expects (the price|little change)/),
    ).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('Forecasts are estimates and can be wrong.');
    expect(container).not.toHaveTextContent('The decision is yours.');
  });

  it('clears the forecast and the explanation when the market or crop changes', async () => {
    const recorder = recordRequests();
    await openExplanation();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Market' }), 'Kisumu');
    expect(screen.queryByTestId('forecast-headline')).not.toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Why the model expects this' })).toBeNull();
    const forecastCalls = () =>
      recorder.requests.filter((r) => r.path === '/api/v1/forecasts').map((r) => r.query.market);
    expect(forecastCalls()).toEqual(['Nairobi']);

    await user.click(requestButton());
    expect(
      await screen.findByRole('heading', { name: 'Maize in Kisumu, in 1 month' }),
    ).toBeVisible();
    await screen.findByText(/Expected in/);
    expect(whyButton()).toHaveAttribute('aria-expanded', 'false');
    expect(forecastCalls()).toEqual(['Nairobi', 'Kisumu']);

    await user.click(screen.getByRole('radio', { name: 'Beans' }));
    expect(screen.queryByTestId('forecast-headline')).not.toBeInTheDocument();
    expect(forecastCalls()).toEqual(['Nairobi', 'Kisumu']);
  });

  it('shows the direction on the headline for a fall', async () => {
    forecastRoute({
      one_month: () =>
        HttpResponse.json({ ...forecastFor(), predicted_price: 38.6, expected_change_pct: -3.5 }),
    });
    await openForecast();
    expect(headline()).toHaveTextContent('-3.5%Falling');
  });

  it('shows little change on the headline', async () => {
    forecastRoute({
      one_month: () =>
        HttpResponse.json({ ...forecastFor(), predicted_price: 40.2, expected_change_pct: 0.5 }),
    });
    await openForecast();
    expect(headline()).toHaveTextContent('+0.5%Little change');
  });
});

describe('ForecastScreen: explanation', () => {
  it('walks from the latest price, through signed steps, to the forecast price', async () => {
    await openExplanation();
    const figure = screen.getByRole('figure');
    const items = within(figure).getAllByRole('listitem');
    expect(items.map((li) => li.dataset.row)).toEqual([
      'start',
      'step',
      'step',
      'step',
      'step',
      'end',
    ]);
    expect(items[0]).toHaveTextContent('Latest priceKES 40.00');
    expect(items[1]).toHaveTextContent('Typical change for this market and crop+KES 0.29');
    expect(items[2]).toHaveTextContent('Time of year+KES 1.45');
    expect(items[3]).toHaveTextContent('Recent price momentum+KES 1.25');
    expect(items[4]).toHaveTextContent('Price compared with its recent average-KES 0.50');
    expect(items.map((li) => li.dataset.direction)).toEqual([
      undefined,
      'up',
      'up',
      'up',
      'down',
      undefined,
    ]);
    expect(items[5]).toHaveTextContent('Forecast in 1 monthKES 42.49');
    expect(items[2].querySelector('[data-bar]')).toHaveClass('bg-positive-soft', 'border-positive');
    expect(items[4].querySelector('[data-bar]')).toHaveClass('bar-hatch-down', 'border-negative');
    expect(items[2].querySelector('[data-bar]')?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(figure).not.toHaveTextContent(/Boost|Drag|No effect/);
    expect(screen.queryByText(/do not add up exactly/)).not.toBeInTheDocument();
  });

  it('has a text alternative, the reading guide and the numbers table', async () => {
    await openExplanation();
    const figure = screen.getByRole('figure');
    expect(figure).toHaveAccessibleName(
      'Forecast for 1 month ahead: KES 42.49 per kg, up 6.2% from the latest price of KES 40.00. Time of year adds about KES 1.45, recent price momentum adds about KES 1.25, and price compared with its recent average takes away about KES 0.50.',
    );
    const table = screen.getByRole('table', { name: 'How the model reached the forecast' });
    const cell = within(table).getByRole('rowheader', { name: 'Time of year' });
    // Closed until the "See the numbers" details element is opened.
    expect(cell).not.toBeVisible();
    const summary = within(figure.parentElement).getByText('See the numbers');
    await userEvent.setup().click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(cell).toBeVisible();
    const row = cell.closest('tr');
    expect(row).toHaveTextContent('Time of year+3.6%+KES 1.45KES 41.74');
    expect(screen.getByText('How to read this')).toBeInTheDocument();
    expect(screen.getByText('What each part means')).toBeInTheDocument();
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
    await openExplanation();
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
    const { container } = await openExplanation();
    expect(headline()).toHaveTextContent('KES 42.49');
    expect(
      screen.getByText('The explanation for this forecast is not available right now.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(screen.queryByText('Latest price')).not.toBeInTheDocument();
    expectNoAbsoluteTime(container, 'malformed explanation');
  });
});

describe('ForecastScreen: unavailable', () => {
  it('no_forecast: the message and the current price', async () => {
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
    expect(screen.queryByText(/The model expects/)).not.toBeInTheDocument();
    expectNoAbsoluteTime(container, 'unavailable');
  });

  it('stale: the out of date message', async () => {
    forecastRoute({ one_month: () => forecastUnavailableResponse('stale') });
    await openForecast('/farmer/forecast', 'out of date');
    expect(
      screen.getByText(
        'The latest forecast for Nairobi maize is out of date because new prices have not been published yet. Please check again soon.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('forecast-headline')).not.toBeInTheDocument();
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
    await openForecast('/farmer/forecast?market=Kisumu&crop=beans');
    expect(screen.getByRole('combobox', { name: 'Market' })).toHaveValue('Kisumu');
    expect(screen.getByRole('radio', { name: 'Beans' })).toBeChecked();
    expect(screen.getByRole('heading', { name: 'Beans in Kisumu, in 1 month' })).toBeVisible();
  });

  it('falls back to the defaults for invalid parameters', async () => {
    const { router } = await openScreen('/farmer/forecast?market=Atlantis&crop=rice&horizon=soon');
    expect(screen.getByRole('combobox', { name: 'Market' })).toHaveValue('Nairobi');
    expect(screen.getByRole('radio', { name: 'Maize' })).toBeChecked();
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('updates the URL from the controls', async () => {
    const { router } = await openScreen();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Market' }), 'Kisumu');
    await user.click(screen.getByRole('radio', { name: 'Beans' }));
    await waitFor(() =>
      expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({
        market: 'Kisumu',
        crop: 'beans',
      }),
    );
    await user.click(requestButton());
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
    expect(screen.queryByText(/These forecasts use monthly prices/)).not.toBeInTheDocument();
  });

  it('a 401 clears the session and goes to the login screen', async () => {
    server.use(
      http.get(apiUrl('/api/v1/forecasts'), () => errorResponse(401, 'invalid_credentials')),
    );
    const { router } = await openScreen();
    await userEvent.setup().click(requestButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(getSession()).toBeNull();
  });
});
