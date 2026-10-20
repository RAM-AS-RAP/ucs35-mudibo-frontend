import { describe, expect, it } from 'vitest';
import { checkAskingPrice, comparisonWords } from './priceCheck';

describe('checkAskingPrice', () => {
  // Latest price 40: ok 28 to 56, caution 20 to 28 and 56 to 80, confirm outside.
  it.each([
    ['40', 'ok'],
    ['28', 'ok'], // exactly 0.7
    ['56', 'ok'], // exactly 1.4
    ['27.99', 'caution'],
    ['56.01', 'caution'],
    ['20', 'caution'], // exactly 0.5
    ['80', 'caution'], // exactly 2
    ['19.99', 'confirm'],
    ['80.01', 'confirm'],
    ['120', 'confirm'], // 3 times: a price per bag typed as per kg
    ['0.4', 'confirm'],
  ])('asking %s against 40 is %s', (asking, level) => {
    expect(checkAskingPrice(asking, 40).level).toBe(level);
  });

  it('returns the ratio for the wording', () => {
    expect(checkAskingPrice('64', 40)).toEqual({ level: 'caution', ratio: 1.6 });
    expect(checkAskingPrice('120', 40)).toEqual({ level: 'confirm', ratio: 3 });
  });

  it('is ok when there is no latest price or no valid asking price', () => {
    expect(checkAskingPrice('500', null)).toEqual({ level: 'ok', ratio: null });
    expect(checkAskingPrice('500', undefined)).toEqual({ level: 'ok', ratio: null });
    expect(checkAskingPrice('', 40)).toEqual({ level: 'ok', ratio: null });
    expect(checkAskingPrice('abc', 40)).toEqual({ level: 'ok', ratio: null });
  });

  it('handles a latest price with decimals exactly', () => {
    // 0.7 x 37.5 = 26.25 exactly.
    expect(checkAskingPrice('26.25', 37.5).level).toBe('ok');
    expect(checkAskingPrice('26.24', 37.5).level).toBe('caution');
  });
});

describe('comparisonWords', () => {
  it('says how far above or below, or how many times', () => {
    expect(comparisonWords(1.6)).toBe('about 60% above');
    expect(comparisonWords(0.6)).toBe('about 40% below');
    expect(comparisonWords(3)).toBe('about 3 times');
    expect(comparisonWords(2.25)).toBe('about 2.3 times');
  });
});
