import { describe, expect, it } from 'vitest';
import { DEFAULT_WAIT_SECONDS, formatWait, waitSecondsFrom } from './waitTime';

describe('formatWait', () => {
  it.each([
    [1, '1 second'],
    [2, '2 seconds'],
    [30, '30 seconds'],
    [89, '89 seconds'],
    [90, 'about 2 minutes'],
    [120, 'about 2 minutes'],
    [121, 'about 3 minutes'],
    [600, 'about 10 minutes'],
    [3600, 'about 60 minutes'],
    [5340, 'about 89 minutes'],
    [5341, 'about 2 hours'],
    [5400, 'about 2 hours'],
    [7200, 'about 2 hours'],
    [7201, 'about 3 hours'],
    [86400, 'about 24 hours'],
  ])('%i seconds reads "%s"', (seconds, text) => {
    expect(formatWait(seconds)).toBe(text);
  });

  it.each([0, -5, 0.2, Number.NaN, Number.POSITIVE_INFINITY])(
    'never reads zero or negative (%s)',
    (seconds) => {
      expect(formatWait(seconds)).toBe('1 second');
    },
  );
});

describe('waitSecondsFrom', () => {
  it('uses the parsed Retry-After seconds', () => {
    expect(waitSecondsFrom(30)).toBe(30);
    expect(waitSecondsFrom(7200)).toBe(7200);
  });

  it('parses a raw header with parseRetryAfter', () => {
    expect(waitSecondsFrom('600')).toBe(600);
  });

  it.each([null, undefined, 0, -1, '', 'soon'])('falls back to 60 seconds for %s', (value) => {
    expect(waitSecondsFrom(value)).toBe(DEFAULT_WAIT_SECONDS);
    expect(DEFAULT_WAIT_SECONDS).toBe(60);
  });
});
