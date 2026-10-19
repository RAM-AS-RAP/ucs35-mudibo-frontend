import { describe, expect, it } from 'vitest';
import { fixtures } from '@/test/fixtures';
import {
  BAG_KG,
  bagPriceText,
  buildMonthAxis,
  directionOf,
  explainabilityRows,
  kgToBagPrice,
  NEUTRAL_THRESHOLD_PCT,
  recommendationFor,
  summaryText,
} from './forecast';
import { FORECAST_TEXT, groupDescription } from './messages';
import { parseShap } from './shapSchema';

const sample = fixtures.forecastOneMonth;
const shap = /** @type {import('./shapSchema').ShapValues} */ (parseShap(sample.shap_values));

describe('constants', () => {
  it('has one neutral threshold and the bag size', () => {
    expect(NEUTRAL_THRESHOLD_PCT).toBe(1);
    expect(BAG_KG).toBe(90);
  });
});

describe('directionOf', () => {
  it.each([
    [1, 'rise'],
    [6.18, 'rise'],
    [0.99, 'flat'],
    [0, 'flat'],
    [-0.99, 'flat'],
    [-1, 'fall'],
    [-3.5, 'fall'],
    [null, 'flat'],
    [undefined, 'flat'],
    [Number.NaN, 'flat'],
  ])('%s is %s', (pct, direction) => {
    expect(directionOf(/** @type {any} */ (pct))).toBe(direction);
  });
});

describe('kgToBagPrice', () => {
  it.each([
    [82, 7380],
    [42.49, 3820], // 3824.1
    [40, 3600],
    [37.5, 3380], // 3375 rounds half up
    [0.04, 0],
  ])('%s per kg is %s per bag', (perKg, bag) => {
    expect(kgToBagPrice(perKg)).toBe(bag);
  });

  it('is null for a missing price', () => {
    expect(kgToBagPrice(null)).toBeNull();
    expect(kgToBagPrice(Number.NaN)).toBeNull();
  });

  it('builds the display line', () => {
    expect(bagPriceText(82)).toBe('About KES 7,380 per 90 kg bag');
    expect(bagPriceText(null)).toBeNull();
  });
});

describe('explainabilityRows', () => {
  const { rows, typical } = explainabilityRows(shap);

  it('sorts by absolute log contribution, largest first', () => {
    expect(rows.map((r) => r.label)).toEqual([
      'Time of year',
      'Recent price momentum',
      'Price compared with its recent average',
    ]);
  });

  it('gives each row its word, description, pct and KES impact', () => {
    expect(rows.map((r) => r.word)).toEqual(['Boost', 'Boost', 'Drag']);
    expect(rows.map((r) => r.kesImpact)).toEqual([1.42, 1.22, -0.48]);
    expect(rows.map((r) => r.pct)).toEqual([3.56, 3.05, -1.19]);
    expect(rows[0].description).toBe(groupDescription('Time of year'));
  });

  it('keeps every bar fraction between 0 and 1 with the largest at 1', () => {
    const fractions = [...rows.map((r) => r.barFraction), typical.barFraction];
    for (const f of fractions) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...fractions)).toBe(1);
    expect(rows[0].barFraction).toBe(1);
    expect(typical.barFraction).toBeCloseTo(0.7 / 3.56, 10);
  });

  it('returns the typical change separately', () => {
    expect(typical).toEqual({
      label: 'Typical change for this market and crop',
      description: FORECAST_TEXT.typicalDescription,
      pct: 0.7,
      barFraction: expect.any(Number),
    });
  });

  it('uses "No effect" for a neutral group and the typical change when it is largest', () => {
    const custom = {
      ...shap,
      typical_change: { ...shap.typical_change, pct_value: -5 },
      groups: [{ label: 'Other', log_contribution: 0, pct_contribution: 0, direction: 'neutral' }],
    };
    const result = explainabilityRows(/** @type {any} */ (custom));
    expect(result.rows[0].word).toBe('No effect');
    expect(result.rows[0].barFraction).toBe(0);
    expect(result.typical.barFraction).toBe(1);
    expect(result.rows[0].description).toBe('Another pattern the model found in past prices.');
  });
});

describe('recommendationFor', () => {
  it('rise', () => {
    expect(recommendationFor(6.18, 'one_month')).toEqual({
      tone: 'rise',
      title: 'The model expects the price to rise',
      body: 'The forecast is for the price to rise by about 6.2% in 1 month. Waiting may give a better price, but only if you can keep your produce safely and do not need the money sooner. The decision is yours.',
    });
  });

  it('fall', () => {
    expect(recommendationFor(-3.5, 'two_month')).toEqual({
      tone: 'fall',
      title: 'The model expects the price to fall',
      body: 'The forecast is for the price to fall by about 3.5% in 2 months. Selling sooner may protect your income, if you have a buyer. The decision is yours.',
    });
  });

  it('flat', () => {
    expect(recommendationFor(0.4, 'one_month')).toEqual({
      tone: 'flat',
      title: 'The model expects little change',
      body: 'Choose when to sell based on your own needs and the offers you receive.',
    });
  });

  it('never says "will" and keeps the uncertainty line separate', () => {
    for (const pct of [6.18, -3.5, 0]) {
      const { title, body } = recommendationFor(pct, 'one_month');
      expect(`${title} ${body}`).not.toMatch(/\bwill\b/i);
    }
    expect(FORECAST_TEXT.uncertainty).toBe(
      'Forecasts are estimates and can be wrong. Weather, supply, policy and local conditions can change prices in ways the model cannot see.',
    );
  });
});

describe('summaryText', () => {
  it('matches the sample exactly', () => {
    const { rows } = explainabilityRows(shap);
    expect(summaryText(sample, rows)).toBe(
      'Forecast for 1 month ahead: KES 42.49 per kg, up 6.2% from the latest price of KES 40.00. Time of year adds about KES 1.42, recent price momentum adds about KES 1.22, and price compared with its recent average takes away about KES 0.48.',
    );
  });

  it('describes a fall over two months', () => {
    const two = fixtures.forecastTwoMonth;
    const { rows } = explainabilityRows(
      /** @type {import('./shapSchema').ShapValues} */ (parseShap(two.shap_values)),
    );
    expect(summaryText(two, rows)).toBe(
      'Forecast for 2 months ahead: KES 38.60 per kg, down 3.5% from the latest price of KES 40.00. Time of year takes away about KES 0.99, recent price momentum takes away about KES 0.40, and price compared with its recent average takes away about KES 0.18.',
    );
  });
});

describe('buildMonthAxis', () => {
  const p = (month, price) => ({ month, avg_price_per_kg: price });

  it('lists every month and fills gaps with null, never interpolating', () => {
    const axis = buildMonthAxis(
      [p('2026-03-01', 30), p('2026-06-01', 60)],
      '2026-03-01',
      '2026-06-01',
    );
    expect(axis).toEqual([
      { month: '2026-03-01', price: 30 },
      { month: '2026-04-01', price: null },
      { month: '2026-05-01', price: null },
      { month: '2026-06-01', price: 60 },
    ]);
  });

  it('crosses a year boundary', () => {
    const axis = buildMonthAxis(
      [p('2025-11-01', 1), p('2026-02-01', 4)],
      '2025-11-01',
      '2026-02-01',
    );
    expect(axis.map((a) => a.month)).toEqual([
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
    ]);
    expect(axis.map((a) => a.price)).toEqual([1, null, null, 4]);
  });

  it('is empty without a first or last month', () => {
    expect(buildMonthAxis([], null, null)).toEqual([]);
  });
});
