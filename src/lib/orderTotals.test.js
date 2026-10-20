import { describe, expect, it } from 'vitest';
import { estimateTotalKES } from './orderTotals';

describe('estimateTotalKES', () => {
  it.each([
    ['2.5', '112.56', 282],
    ['1', '40.00', 40],
    ['0.01', '40', 1],
    ['1', '40', 40],
    ['3', '33.33', 100],
    ['0.1', '0.1', 1],
  ])('%s kg at KES %s gives KES %i', (qty, price, total) => {
    expect(estimateTotalKES(qty, price)).toBe(total);
  });

  it('does not round up an exact whole shilling', () => {
    expect(estimateTotalKES('2', '50.50')).toBe(101);
    expect(estimateTotalKES('4', '0.25')).toBe(1);
    expect(estimateTotalKES('10', '10')).toBe(100);
  });

  it('rounds up anything above a whole shilling, even one hundredth of a cent', () => {
    expect(estimateTotalKES('1.01', '1.01')).toBe(2); // 1.0201
    expect(estimateTotalKES('100', '0.01')).toBe(1);
    expect(estimateTotalKES('101', '0.01')).toBe(2); // 1.01
  });

  it('accepts API numbers as the price', () => {
    expect(estimateTotalKES('2.5', 112.56)).toBe(282);
    expect(estimateTotalKES('3', 0.1)).toBe(1);
  });

  it('has no floating point artefacts', () => {
    // 0.1 * 3 is 0.30000000000000004 in floating point; 1.15 * 100 is 114.99999999999999.
    expect(estimateTotalKES('3', '0.1')).toBe(1);
    expect(estimateTotalKES('100', '1.15')).toBe(115);
    expect(estimateTotalKES('0.29', '100')).toBe(29);
  });

  it('handles large values exactly', () => {
    expect(estimateTotalKES('100000', '100000')).toBe(10_000_000_000);
    expect(estimateTotalKES('99999.99', '99999.99')).toBe(9_999_998_001);
  });

  it.each([
    ['', '40'],
    ['abc', '40'],
    ['1,5', '40'],
    ['1e3', '40'],
    ['-1', '40'],
    ['1.234', '40'],
    ['1', ''],
    ['1', 'NaN'],
    [null, '40'],
    ['1', undefined],
    ['1', Number.NaN],
    ['1', -5],
  ])('returns null for invalid input (%s, %s)', (qty, price) => {
    expect(estimateTotalKES(/** @type {any} */ (qty), /** @type {any} */ (price))).toBeNull();
  });

  it('returns 0 for a zero quantity', () => {
    expect(estimateTotalKES('0', '40')).toBe(0);
  });
});
