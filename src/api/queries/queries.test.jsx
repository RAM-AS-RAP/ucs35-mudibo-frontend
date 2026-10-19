import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, forecastUnavailableResponse } from '@/test/msw/handlers';
import { loginAs, logout } from '@/test/render';
import { queryClient } from '@/lib/queryClient';
import { ApiError } from '../errors';
import {
  queryKeys,
  RETRY_POLICY,
  retryDelay,
  shouldRetry,
  STALE_TIME_MS,
  useForecast,
  useMarkets,
  usePriceTrends,
} from './index';

const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const originalDelay = RETRY_POLICY.baseDelayMs;
beforeAll(() => {
  RETRY_POLICY.baseDelayMs = 1;
});
afterAll(() => {
  RETRY_POLICY.baseDelayMs = originalDelay;
});
afterEach(() => {
  logout();
  queryClient.clear();
});

const apiError = (status, code = 'x') => new ApiError({ status, code });

describe('retry policy', () => {
  it('never retries a 4xx', () => {
    for (const status of [400, 401, 403, 404, 422, 429]) {
      expect(shouldRetry(0, apiError(status))).toBe(false);
    }
  });

  it('retries network errors, timeouts and 5xx at most twice', () => {
    for (const error of [apiError(0, 'network_error'), apiError(0, 'timeout'), apiError(503)]) {
      expect(shouldRetry(0, error)).toBe(true);
      expect(shouldRetry(1, error)).toBe(true);
      expect(shouldRetry(2, error)).toBe(false);
    }
  });

  it('does not retry an unknown error', () => {
    expect(shouldRetry(0, new Error('boom'))).toBe(false);
  });

  it('backs off exponentially with a cap', () => {
    const saved = RETRY_POLICY.baseDelayMs;
    RETRY_POLICY.baseDelayMs = 1000;
    expect([0, 1, 2, 5].map(retryDelay)).toEqual([1000, 2000, 4000, 8000]);
    RETRY_POLICY.baseDelayMs = saved;
  });

  it('keeps data fresh for five minutes', () => {
    expect(STALE_TIME_MS).toBe(300_000);
  });
});

describe('query keys', () => {
  it('hold only the non sensitive parameters', () => {
    loginAs('farmer', { token: 'secret-token-value' });
    const keys = [
      queryKeys.markets(),
      queryKeys.currentPrices('maize'),
      queryKeys.priceTrends({ market: 'Nairobi', crop: 'maize', months: 24 }),
      queryKeys.forecast({ market: 'Nairobi', crop: 'maize', horizon: 'one_month' }),
    ];
    expect(keys).toEqual([
      ['markets'],
      ['prices', 'current', { crop: 'maize' }],
      ['prices', 'trends', { market: 'Nairobi', crop: 'maize', months: 24 }],
      ['forecasts', { market: 'Nairobi', crop: 'maize', horizon: 'one_month' }],
    ]);
    expect(JSON.stringify(keys)).not.toContain('secret-token-value');
  });
});

describe('hooks', () => {
  /** Count calls to a route answering with `respond`. */
  function count(path, respond) {
    const calls = { n: 0 };
    server.use(
      http.get(apiUrl(path), () => {
        calls.n += 1;
        return respond();
      }),
    );
    return calls;
  }

  it('a 500 is tried three times in all, then fails', async () => {
    const calls = count('/api/v1/markets', () => errorResponse(500, 'internal_error'));
    const { result } = renderHook(() => useMarkets(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls.n).toBe(3);
  });

  it('a network error is tried three times in all', async () => {
    const calls = count('/api/v1/markets', () => HttpResponse.error());
    const { result } = renderHook(() => useMarkets(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls.n).toBe(3);
    expect(result.current.error).toMatchObject({ code: 'network_error' });
  });

  it('a 404 is not retried', async () => {
    const calls = count('/api/v1/prices/trends', () => errorResponse(404, 'market_not_available'));
    const { result } = renderHook(
      () => usePriceTrends({ markets: ['Nairobi'], crop: 'maize', months: 12 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current[0].isError).toBe(true));
    expect(calls.n).toBe(1);
  });

  it('useForecast resolves an unavailable forecast without an error', async () => {
    server.use(http.get(apiUrl('/api/v1/forecasts'), () => forecastUnavailableResponse('stale')));
    const { result } = renderHook(
      () => useForecast({ market: 'Nairobi', crop: 'maize', horizon: 'two_month' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ status: 'unavailable', reason: 'stale' });
  });

  it('useForecast waits for a market', () => {
    const { result } = renderHook(
      () => useForecast({ market: null, crop: 'maize', horizon: 'one_month' }),
      { wrapper },
    );
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('usePriceTrends runs one query per market', async () => {
    const { result } = renderHook(
      () => usePriceTrends({ markets: ['Nairobi', 'Kisumu'], crop: 'maize', months: 12 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.every((r) => r.isSuccess)).toBe(true));
    expect(result.current.map((r) => r.data?.market)).toEqual(['Nairobi', 'Kisumu']);
  });
});
