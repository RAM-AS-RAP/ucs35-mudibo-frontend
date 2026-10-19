import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  agoLabel,
  axisTick,
  horizonMonths,
  inLabel,
  inLabelCap,
  monthFromIndex,
  monthIndex,
  monthsBetween,
  olderLabel,
  referenceMonth,
} from './relativeTime';

describe('monthIndex and monthsBetween', () => {
  it('counts months as year * 12 + (month - 1)', () => {
    expect(monthIndex('2026-08-01')).toBe(2026 * 12 + 7);
    expect(monthIndex('2026-08')).toBe(2026 * 12 + 7);
    expect(monthsBetween('2026-08-01', '2026-05-01')).toBe(3);
    expect(monthsBetween('2026-05-01', '2026-08-01')).toBe(-3);
  });

  it('crosses a year boundary', () => {
    expect(monthsBetween('2026-01-01', '2025-12-01')).toBe(1);
    expect(monthsBetween('2026-02-01', '2024-11-01')).toBe(15);
  });

  it('round trips through monthFromIndex', () => {
    for (const iso of ['2025-12-01', '2026-01-01', '2026-08-01']) {
      expect(monthFromIndex(monthIndex(iso))).toBe(iso);
    }
  });

  it.each(['', 'August 2026', '2026-13-01', '2026-00-01', '26-08-01', '2026/08/01'])(
    'throws a clear error for %j',
    (bad) => {
      expect(() => monthIndex(bad)).toThrow(/Expected a YYYY-MM-DD month string/);
    },
  );

  it('throws for a non string', () => {
    // @ts-expect-error wrong type on purpose
    expect(() => monthIndex(null)).toThrow(/YYYY-MM-DD/);
  });
});

describe('labels', () => {
  it('agoLabel: Latest, singular, plural, negative clamped to 0', () => {
    expect(agoLabel(0)).toBe('Latest');
    expect(agoLabel(1)).toBe('1 month ago');
    expect(agoLabel(2)).toBe('2 months ago');
    expect(agoLabel(14)).toBe('14 months ago');
    expect(agoLabel(-3)).toBe('Latest');
  });

  it('inLabel and inLabelCap', () => {
    expect(inLabel(1)).toBe('in 1 month');
    expect(inLabel(2)).toBe('in 2 months');
    expect(inLabelCap(1)).toBe('In 1 month');
    expect(inLabelCap(2)).toBe('In 2 months');
  });

  it('olderLabel', () => {
    expect(olderLabel(1)).toBe('1 month older');
    expect(olderLabel(3)).toBe('3 months older');
  });

  it('axisTick', () => {
    expect(axisTick(0)).toBe('Now');
    expect(axisTick(3)).toBe('3 mo ago');
    expect(axisTick(-1)).toBe('Now');
  });

  it('horizonMonths', () => {
    expect(horizonMonths('one_month')).toBe(1);
    expect(horizonMonths('two_month')).toBe(2);
    expect(() => horizonMonths('three_month')).toThrow(/Unknown forecast horizon/);
  });

  it('referenceMonth is the newest month and ignores empty values', () => {
    expect(referenceMonth(['2026-07-01', '2026-08-01', null, '2025-12-01'])).toBe('2026-08-01');
    expect(referenceMonth([])).toBeNull();
    expect(referenceMonth([undefined, ''])).toBeNull();
    expect(() => referenceMonth(['soon'])).toThrow(/YYYY-MM-DD/);
  });
});

describe('time zone independence', () => {
  const originalTz = process.env.TZ;
  afterAll(() => {
    process.env.TZ = originalTz;
    vi.resetModules();
  });

  /** Every function on a fixed set of inputs, with the module imported fresh. */
  async function snapshot() {
    vi.resetModules();
    const m = await import('./relativeTime');
    return {
      index: ['2025-12-01', '2026-01-01', '2026-08-01'].map(m.monthIndex),
      between: m.monthsBetween('2026-01-01', '2025-12-01'),
      labels: [0, 1, 2, 12].map((n) => [
        m.agoLabel(n),
        m.inLabel(n),
        m.olderLabel(n),
        m.axisTick(n),
      ]),
      reference: m.referenceMonth(['2025-12-01', '2026-01-01']),
    };
  }

  it('gives identical results with TZ=UTC and TZ=Pacific/Kiritimati', async () => {
    process.env.TZ = 'UTC';
    const utc = await snapshot();
    process.env.TZ = 'Pacific/Kiritimati';
    const kiritimati = await snapshot();
    expect(kiritimati).toEqual(utc);
    expect(utc.between).toBe(1);
  });
});
