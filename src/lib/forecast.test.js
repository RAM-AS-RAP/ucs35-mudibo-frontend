import { describe, expect, it } from 'vitest';
import { fixtures } from '@/test/fixtures';
import {
  BAG_KG,
  bagPriceText,
  buildMonthAxis,
  directionOf,
  axisPercent,
  explainabilityChart,
  kgToBagPrice,
  MIN_AXIS_SHARE,
  stepAmountText,
  NEUTRAL_THRESHOLD_PCT,
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

describe('explainabilityChart', () => {
  const chart = explainabilityChart(shap);

  it('starts at the latest price and ends at the forecast price', () => {
    expect(chart.start).toBe(40);
    expect(chart.end).toBe(42.49);
    expect(chart.shared).toBe(true);
  });

  it('puts the typical change first, then the groups by absolute log contribution', () => {
    expect(chart.steps.map((s) => s.label)).toEqual([
      'Typical change for this market and crop',
      'Time of year',
      'Recent price momentum',
      'Price compared with its recent average',
    ]);
    expect(chart.steps.map((s) => s.kind)).toEqual(['typical', 'group', 'group', 'group']);
    expect(chart.steps[0].description).toBe(FORECAST_TEXT.typicalDescription);
    expect(chart.steps[1].description).toBe(groupDescription('Time of year'));
    expect(chart.steps.map((s) => s.pct)).toEqual([0.7, 3.56, 3.05, -1.19]);
  });

  it('shares out the KES change by log contribution so the steps land on the forecast', () => {
    expect(chart.steps.map((s) => s.kes)).toEqual([0.29, 1.45, 1.25, -0.5]);
    expect(chart.steps.map((s) => s.up)).toEqual([true, true, true, false]);
    expect(chart.steps.map((s) => [s.from, s.to])).toEqual([
      [40, 40.29],
      [40.29, 41.74],
      [41.74, 42.99],
      [42.99, 42.49],
    ]);
    expect(chart.steps[chart.steps.length - 1].to).toBe(chart.end);
  });

  it('lands exactly on a falling forecast too', () => {
    const two = /** @type {import('./shapSchema').ShapValues} */ (
      parseShap(fixtures.forecastTwoMonth.shap_values)
    );
    const fall = explainabilityChart(two);
    expect(fall.steps.map((s) => s.kes)).toEqual([0.16, -0.98, -0.4, -0.18]);
    expect(fall.steps.at(-1)?.to).toBe(38.6);
  });

  it('never has a neutral step: a zero contribution takes the sign of its percentage or direction', () => {
    const custom = {
      ...shap,
      groups: [
        ...shap.groups,
        { label: 'Other', log_contribution: 0, pct_contribution: 0, direction: 'neutral' },
        { label: 'Down', log_contribution: 0, pct_contribution: -0.001, direction: 'neutral' },
      ],
    };
    const steps = explainabilityChart(/** @type {any} */ (custom)).steps;
    const other = steps.find((s) => s.label === 'Other');
    const down = steps.find((s) => s.label === 'Down');
    expect(other?.up).toBe(true);
    expect(down?.up).toBe(false);
    expect(stepAmountText(/** @type {any} */ (other))).toBe('+KES 0.00');
    expect(stepAmountText(/** @type {any} */ (down))).toBe('-KES 0.00');
  });

  it('keeps each part its own amount when the explanation disagrees with the headline', () => {
    const custom = { ...shap, predicted_price: 60 };
    const result = explainabilityChart(/** @type {any} */ (custom));
    expect(result.shared).toBe(false);
    expect(result.steps.map((s) => s.kes)).toEqual([0.28, 1.42, 1.22, -0.48]);
  });

  it('zooms the scale to the steps, with ticks inside it', () => {
    const { axis } = chart;
    expect(axis.min).toBeLessThan(40);
    expect(axis.min).toBeGreaterThan(39.5);
    expect(axis.max).toBeGreaterThan(42.99);
    expect(axis.max).toBeLessThan(43.5);
    expect(axis.ticks).toEqual([40, 41, 42, 43]);
    expect(axisPercent(axis, axis.min)).toBe(0);
    expect(axisPercent(axis, axis.max)).toBe(100);
  });

  it('keeps a tiny change from filling the scale', () => {
    const tiny = {
      ...shap,
      predicted_price: 40.02,
      typical_change: { ...shap.typical_change, log_value: 0.0005, pct_value: 0.05 },
      groups: [
        { label: 'Time of year', log_contribution: 0, pct_contribution: 0, direction: 'neutral' },
      ],
    };
    const { axis } = explainabilityChart(/** @type {any} */ (tiny));
    expect(axis.max - axis.min).toBeGreaterThanOrEqual(40 * MIN_AXIS_SHARE);
  });
});

describe('stepAmountText', () => {
  it('signs by direction', () => {
    expect(stepAmountText({ up: true, kes: 1.45 })).toBe('+KES 1.45');
    expect(stepAmountText({ up: false, kes: -0.5 })).toBe('-KES 0.50');
  });
});

describe('summaryText', () => {
  it('matches the sample exactly', () => {
    const { steps } = explainabilityChart(shap);
    expect(summaryText(sample, steps)).toBe(
      'Forecast for 1 month ahead: KES 42.49 per kg, up 6.2% from the latest price of KES 40.00. Time of year adds about KES 1.45, recent price momentum adds about KES 1.25, and price compared with its recent average takes away about KES 0.50.',
    );
  });

  it('describes a fall over two months', () => {
    const two = fixtures.forecastTwoMonth;
    const { steps } = explainabilityChart(
      /** @type {import('./shapSchema').ShapValues} */ (parseShap(two.shap_values)),
    );
    expect(summaryText(two, steps)).toBe(
      'Forecast for 2 months ahead: KES 38.60 per kg, down 3.5% from the latest price of KES 40.00. Time of year takes away about KES 0.98, recent price momentum takes away about KES 0.40, and price compared with its recent average takes away about KES 0.18.',
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
