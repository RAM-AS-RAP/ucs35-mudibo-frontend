import { afterEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import {
  apiUrl,
  errorResponse,
  forecastFor,
  forecastUnavailableResponse,
  marketNotAvailableResponse,
} from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { loginAs, logout } from '@/test/render';
import { ApiError } from '../errors';
import { getCurrentPrices, getForecast, getMarkets, getPriceTrends } from './index';

afterEach(() => logout());

/** Record the query string and Authorization header of each call to a GET route. */
function captureGet(path, respond) {
  const seen =
    /** @type {Array<{ query: Record<string, string>, authorization: string | null }>} */ ([]);
  server.use(
    http.get(apiUrl(path), ({ request }) => {
      seen.push({
        query: Object.fromEntries(new URL(request.url).searchParams),
        authorization: request.headers.get('Authorization'),
      });
      return respond();
    }),
  );
  return seen;
}

describe('price endpoints', () => {
  it('getMarkets returns the list and sends the token', async () => {
    loginAs('farmer', { token: 'farmer-token' });
    const seen = captureGet('/api/v1/markets', () => HttpResponse.json(fixtures.markets));
    await expect(getMarkets()).resolves.toEqual(fixtures.markets);
    expect(seen[0].authorization).toBe('Bearer farmer-token');
  });

  it('getCurrentPrices sends the crop and returns { items, as_of_note }', async () => {
    const seen = captureGet('/api/v1/prices/current', () =>
      HttpResponse.json(fixtures.currentPricesBeans),
    );
    const result = await getCurrentPrices('beans');
    expect(seen[0].query).toEqual({ crop: 'beans' });
    expect(result.items).toHaveLength(2);
    expect(typeof result.as_of_note).toBe('string');
  });

  it('getPriceTrends sends market, crop and months (and omits months when not given)', async () => {
    const seen = captureGet('/api/v1/prices/trends', () =>
      HttpResponse.json(fixtures.trendNairobiMaize),
    );
    await getPriceTrends({ market: 'Nairobi', crop: 'maize', months: 12 });
    await getPriceTrends({ market: 'Kisumu', crop: 'beans' });
    expect(seen.map((s) => s.query)).toEqual([
      { market: 'Nairobi', crop: 'maize', months: '12' },
      { market: 'Kisumu', crop: 'beans' },
    ]);
  });

  it('a 403 for a buyer throws ApiError', async () => {
    loginAs('buyer');
    server.use(http.get(apiUrl('/api/v1/markets'), () => errorResponse(403, 'forbidden')));
    await expect(getMarkets()).rejects.toMatchObject({ status: 403, code: 'forbidden' });
  });
});

describe('getForecast', () => {
  const params = /** @type {const} */ ({ market: 'Nairobi', crop: 'maize', horizon: 'one_month' });

  it('returns { status: "ok", data } and sends all three parameters', async () => {
    const seen = captureGet('/api/v1/forecasts', () => HttpResponse.json(forecastFor()));
    await expect(getForecast(params)).resolves.toEqual({ status: 'ok', data: forecastFor() });
    expect(seen[0].query).toEqual({ market: 'Nairobi', crop: 'maize', horizon: 'one_month' });
  });

  it.each(['no_forecast', 'stale'])(
    'turns 404 forecast_unavailable (%s) into a normal result',
    async (reason) => {
      server.use(
        http.get(apiUrl('/api/v1/forecasts'), () =>
          forecastUnavailableResponse(/** @type {any} */ (reason)),
        ),
      );
      await expect(getForecast(params)).resolves.toEqual({ status: 'unavailable', reason });
    },
  );

  it('still throws for 404 market_not_available', async () => {
    server.use(http.get(apiUrl('/api/v1/forecasts'), marketNotAvailableResponse));
    const error = await getForecast(params).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'market_not_available' });
  });

  it('still throws for a 500 and for a network error', async () => {
    server.use(
      http.get(apiUrl('/api/v1/forecasts'), () =>
        errorResponse(500, 'internal_error', { requestId: 'req-forecast-500' }),
      ),
    );
    await expect(getForecast(params)).rejects.toMatchObject({
      status: 500,
      requestId: 'req-forecast-500',
    });
    server.use(http.get(apiUrl('/api/v1/forecasts'), () => HttpResponse.error()));
    await expect(getForecast(params)).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });
});
