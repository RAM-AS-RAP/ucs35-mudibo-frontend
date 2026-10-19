import { describe, expect, it } from 'vitest';
import { fixtures } from '@/test/fixtures';
import { trendFor } from '@/test/msw/handlers';
import {
  buildTrendRows,
  monthsOlderByMarket,
  plottedMonthCount,
  priceTickFormatter,
  tickFormatter,
  toChartData,
  tooltipLine,
  trendSummary,
} from './trends';

const p = (month, price) => ({ month, avg_price_per_kg: price, source: 'fews_net' });
const trend = (market, points) => ({
  market,
  crop: 'maize',
  points,
  first_month: points[0]?.month ?? null,
  last_month: points[points.length - 1]?.month ?? null,
  count: points.length,
});

describe('buildTrendRows', () => {
  it('places points by months before the newest latest month, oldest first', () => {
    const { rows, markets, lag } = buildTrendRows([
      trend('Nairobi', [p('2026-06-01', 30), p('2026-08-01', 40)]),
    ]);
    expect(markets).toEqual(['Nairobi']);
    expect(lag).toEqual({ Nairobi: 0 });
    expect(rows).toEqual([
      { n: 2, values: { Nairobi: 30 } },
      { n: 1, values: { Nairobi: null } },
      { n: 0, values: { Nairobi: 40 } },
    ]);
  });

  it('puts a lagging market its lag back on the shared axis', () => {
    const { rows, lag } = buildTrendRows([
      trend('Nairobi', [p('2026-07-01', 38), p('2026-08-01', 40)]),
      trend('Kisumu', [p('2026-06-01', 36), p('2026-07-01', 37.5)]),
    ]);
    expect(lag).toEqual({ Nairobi: 0, Kisumu: 1 });
    expect(rows).toEqual([
      { n: 2, values: { Nairobi: null, Kisumu: 36 } },
      { n: 1, values: { Nairobi: 38, Kisumu: 37.5 } },
      { n: 0, values: { Nairobi: 40, Kisumu: null } },
    ]);
    expect(toChartData(rows)[2]).toEqual({ n: 0, Nairobi: 40, Kisumu: null });
  });

  it('keeps the fixture gap as a gap (null), never interpolated', () => {
    const { rows } = buildTrendRows([trendFor({ market: 'Nairobi', crop: 'maize', months: 12 })]);
    // The Nairobi maize fixture has no price five months before its latest month.
    const gap = rows.find((r) => r.n === 5);
    expect(gap?.values.Nairobi).toBeNull();
    expect(rows.find((r) => r.n === 4)?.values.Nairobi).toEqual(expect.any(Number));
    expect(rows.find((r) => r.n === 6)?.values.Nairobi).toEqual(expect.any(Number));
    expect(plottedMonthCount(rows)).toBe(11);
  });

  it('is empty without data', () => {
    expect(buildTrendRows([trend('Nairobi', [])]).rows).toEqual([]);
  });
});

describe('formatters', () => {
  it('labels every third tick only, counted from Now', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 12].map(tickFormatter)).toEqual([
      'Now',
      '',
      '',
      '3 mo ago',
      '',
      '',
      '6 mo ago',
      '12 mo ago',
    ]);
  });

  it('formats the tooltip with relative months', () => {
    expect(tooltipLine(3, 82)).toBe('3 months ago: KES 82.00');
    expect(tooltipLine(0, 40)).toBe('Latest: KES 40.00');
    expect(tooltipLine(1, 1)).toBe('1 month ago: KES 1.00');
    expect(tooltipLine(2, null)).toBe('2 months ago: No price');
  });

  it('formats the y axis in whole KES', () => {
    expect(priceTickFormatter(40)).toBe('KES 40');
    expect(priceTickFormatter(1250)).toBe('KES 1,250');
  });
});

describe('trendSummary', () => {
  it('describes each market with relative months only', () => {
    const points = [
      p('2025-07-01', 80),
      p('2025-08-01', 76),
      p('2026-02-01', 74),
      p('2026-06-01', 90),
      p('2026-08-01', 82),
    ];
    const { rows, markets } = buildTrendRows([trend('Nairobi', points)]);
    expect(trendSummary(rows, markets, 'maize')).toBe(
      'Maize in Nairobi, 5 months of prices. Latest KES 82.00. Lowest KES 74.00, 6 months ago. Highest KES 90.00, 2 months ago.',
    );
  });

  it('says how old a lagging market is', () => {
    const { rows, markets } = buildTrendRows([
      trend('Nairobi', [p('2026-07-01', 38), p('2026-08-01', 40)]),
      trend('Kisumu', [p('2026-06-01', 36), p('2026-07-01', 36)]),
    ]);
    expect(trendSummary(rows, markets, 'maize')).toBe(
      'Maize in Nairobi, 2 months of prices. Latest KES 40.00. Lowest KES 38.00, 1 month ago. Highest KES 40.00. ' +
        'Maize in Kisumu, 2 months of prices. Latest KES 36.00, 1 month ago. Lowest KES 36.00, 1 month ago. Highest KES 36.00, 1 month ago.',
    );
  });
});

describe('monthsOlderByMarket', () => {
  it('gives the lag of each market against the newest latest month', () => {
    expect(monthsOlderByMarket(fixtures.currentPricesMaize.items)).toEqual({
      Nairobi: 0,
      Kisumu: 1,
    });
    expect(monthsOlderByMarket(fixtures.currentPricesBeans.items)).toEqual({
      Nairobi: 0,
      Kisumu: 0,
    });
  });

  it('treats an unreadable month as no lag', () => {
    expect(monthsOlderByMarket([{ market: 'X', month: 'soon' }])).toEqual({ X: 0 });
    expect(monthsOlderByMarket([{ market: 'X', month: null }])).toEqual({ X: 0 });
  });
});
