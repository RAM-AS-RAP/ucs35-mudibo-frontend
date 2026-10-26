import { describe, expect, it } from 'vitest';
import { formatDateTime, formatKES, formatMonth, formatPct } from './format';

// Intl may use (narrow) no-break spaces in some outputs; the regex class for whitespace matches
// them, so normalise to plain spaces.
const norm = (s) => s.replace(/\s/g, ' ');

describe('formatKES', () => {
  it('formats numbers and numeric strings as KES with two decimals', () => {
    expect(formatKES(1234.5)).toBe('KES 1,234.50');
    expect(formatKES('1234.5')).toBe('KES 1,234.50');
    expect(formatKES(0)).toBe('KES 0.00');
    expect(formatKES(1000000)).toBe('KES 1,000,000.00');
    expect(formatKES('112.56')).toBe('KES 112.56');
  });

  it('shows a dash for missing or invalid values', () => {
    expect(formatKES(null)).toBe('—');
    expect(formatKES(undefined)).toBe('—');
    expect(formatKES('abc')).toBe('—');
    expect(formatKES('')).toBe('—');
  });
});

describe('formatPct', () => {
  it('always shows an explicit sign, and none for zero', () => {
    expect(formatPct(4.5)).toBe('+4.5%');
    expect(formatPct(-2)).toBe('-2.0%');
    expect(formatPct(0)).toBe('0.0%');
    expect(formatPct('2.54')).toBe('+2.5%');
    expect(formatPct(-0.01)).toBe('0.0%');
    expect(formatPct(null)).toBe('—');
  });
});

describe('formatMonth', () => {
  it('shows month and year for date only strings without shifting the month', () => {
    expect(formatMonth('2026-08-01')).toBe('August 2026');
    expect(formatMonth('2026-09')).toBe('September 2026');
    expect(formatMonth('2026-12-31')).toBe('December 2026');
  });

  it('uses Nairobi time for timestamps', () => {
    // 22:30 UTC on 31 August is already 1 September in Nairobi (UTC+3).
    expect(formatMonth('2026-08-31T22:30:00Z')).toBe('September 2026');
  });

  it('handles bad input', () => {
    expect(formatMonth('')).toBe('—');
    expect(formatMonth('not-a-date')).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('shows the time in Africa/Nairobi', () => {
    expect(norm(formatDateTime('2026-10-13T09:05:00Z'))).toBe('13 Oct 2026, 12:05');
  });

  it('handles UTC midnight (03:00 the same day in Nairobi)', () => {
    // ICU versions abbreviate September as "Sep" or "Sept".
    expect(norm(formatDateTime('2026-09-30T00:00:00Z'))).toMatch(/^30 Sept? 2026, 03:00$/);
  });

  it('moves to the next day when UTC is late evening', () => {
    expect(norm(formatDateTime('2026-12-31T21:00:00Z'))).toBe('1 Jan 2027, 00:00');
  });

  it('handles bad input', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('nope')).toBe('—');
  });
});
