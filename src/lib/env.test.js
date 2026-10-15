import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

describe('validateEnv', () => {
  it('accepts an https origin and localhost over http', () => {
    expect(validateEnv({ VITE_API_BASE_URL: 'https://api.example.com' })).toEqual({
      ok: true,
      config: { apiBaseUrl: 'https://api.example.com', showApiStatus: false },
    });
    expect(validateEnv({ VITE_API_BASE_URL: 'http://localhost:8000' }).ok).toBe(true);
    expect(validateEnv({ VITE_API_BASE_URL: 'http://127.0.0.1:8000' }).ok).toBe(true);
  });

  it('reads VITE_SHOW_API_STATUS only when exactly "true"', () => {
    const on = validateEnv({
      VITE_API_BASE_URL: 'http://localhost:8000',
      VITE_SHOW_API_STATUS: 'true',
    });
    expect(on.ok && on.config.showApiStatus).toBe(true);
    const off = validateEnv({
      VITE_API_BASE_URL: 'http://localhost:8000',
      VITE_SHOW_API_STATUS: 'yes',
    });
    expect(off.ok && off.config.showApiStatus).toBe(false);
  });

  it.each([
    [undefined, /not set/],
    ['', /not set/],
    ['not a url', /not a valid URL/],
    ['http://api.example.com', /must use https/],
    ['ftp://localhost', /must use https/],
    ['https://api.example.com/', /must not end with a slash/],
    ['https://api.example.com/api/v1', /without \/api\/v1/],
  ])('rejects %j', (value, message) => {
    const result = validateEnv({ VITE_API_BASE_URL: value });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.errors.join(' ')).toMatch(message);
  });
});
