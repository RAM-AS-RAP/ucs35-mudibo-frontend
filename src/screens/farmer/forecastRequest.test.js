import { afterEach, describe, expect, it, vi } from 'vitest';
import { clear, startDevFakeSession } from '@/auth/session';
import {
  clearForecastRequest,
  getForecastRequest,
  requestForecast,
  setWhyOpen,
} from './forecastRequest';

afterEach(() => {
  clearForecastRequest();
  vi.unstubAllEnvs();
});

describe('forecastRequest', () => {
  it('remembers the market and crop with the explanation closed', () => {
    requestForecast('Kisumu', 'beans');
    expect(getForecastRequest()).toEqual({ market: 'Kisumu', crop: 'beans', whyOpen: false });
    setWhyOpen(true);
    expect(getForecastRequest()?.whyOpen).toBe(true);
  });

  it('keeps the explanation open for the same selection and closes it for a new one', () => {
    requestForecast('Kisumu', 'beans');
    setWhyOpen(true);
    requestForecast('Kisumu', 'beans');
    expect(getForecastRequest()?.whyOpen).toBe(true);
    requestForecast('Nairobi', 'beans');
    expect(getForecastRequest()).toEqual({ market: 'Nairobi', crop: 'beans', whyOpen: false });
  });

  it('ignores setWhyOpen without a request', () => {
    setWhyOpen(true);
    expect(getForecastRequest()).toBeNull();
  });

  it('is forgotten when the session ends', () => {
    vi.stubEnv('DEV', true);
    startDevFakeSession({ role: 'farmer' });
    requestForecast('Kisumu', 'beans');
    clear('logout');
    expect(getForecastRequest()).toBeNull();
  });
});
