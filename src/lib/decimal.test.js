import { describe, expect, it } from 'vitest';
import {
  DECIMAL_ERRORS,
  multiplyMoney,
  parseDecimalInput,
  sameDecimal,
  toDecimalText,
  toHundredths,
} from './decimal';

const opts = { max: 100_000 };

describe('parseDecimalInput', () => {
  it.each([
    ['82.50', '82.5'],
    ['82.5', '82.5'],
    ['82', '82'],
    ['  42  ', '42'],
    ['0.5', '0.5'],
    ['.5', '0.5'],
    ['5.', '5'],
    ['007.10', '7.1'],
    ['100000', '100000'],
    ['100000.00', '100000'],
    ['0.01', '0.01'],
  ])('accepts %j as %j', (text, value) => {
    expect(parseDecimalInput(text, opts)).toEqual({ ok: true, value });
  });

  it.each([
    ['', 'empty', DECIMAL_ERRORS.empty],
    ['   ', 'empty', DECIMAL_ERRORS.empty],
    ['0', 'zero', DECIMAL_ERRORS.notPositive],
    ['0.00', 'zero', DECIMAL_ERRORS.notPositive],
    ['-5', 'negative', DECIMAL_ERRORS.notPositive],
    ['1.234', 'too_many_decimals', DECIMAL_ERRORS.tooManyDecimals(2)],
    ['82,50', 'comma', 'Use a dot for decimals, for example 82.50'],
    ['1e3', 'not_number', DECIMAL_ERRORS.notNumber],
    ['1E3', 'not_number', DECIMAL_ERRORS.notNumber],
    ['NaN', 'not_number', DECIMAL_ERRORS.notNumber],
    ['Infinity', 'not_number', DECIMAL_ERRORS.notNumber],
    ['abc', 'not_number', DECIMAL_ERRORS.notNumber],
    ['12kg', 'not_number', DECIMAL_ERRORS.notNumber],
    ['.', 'not_number', DECIMAL_ERRORS.notNumber],
    ['1.2.3', 'not_number', DECIMAL_ERRORS.notNumber],
    ['+5', 'not_number', DECIMAL_ERRORS.notNumber],
    ['100000.01', 'too_large', 'Enter 100,000 or less.'],
    ['250000', 'too_large', 'Enter 100,000 or less.'],
  ])('rejects %j (%s)', (text, code, error) => {
    expect(parseDecimalInput(text, opts)).toEqual({ ok: false, code, error });
  });

  it('allows zero when asked (editing a quantity), but never a negative value', () => {
    expect(parseDecimalInput('0', { ...opts, allowZero: true })).toEqual({ ok: true, value: '0' });
    expect(parseDecimalInput('-1', { ...opts, allowZero: true })).toMatchObject({
      ok: false,
      error: DECIMAL_ERRORS.negative,
    });
  });

  it('handles null and undefined as empty', () => {
    expect(parseDecimalInput(null, opts)).toMatchObject({ ok: false, code: 'empty' });
    expect(parseDecimalInput(undefined, opts)).toMatchObject({ ok: false, code: 'empty' });
  });
});

describe('multiplyMoney (integer arithmetic, rounded half up)', () => {
  it.each([
    ['2.5', '112.56', '281.40'],
    ['0.1', '0.2', '0.02'],
    ['0.1', '0.3', '0.03'],
    ['3', '33.33', '99.99'],
    ['1.005', '1', null],
    ['0.05', '0.1', '0.01'],
    ['0.01', '0.49', '0.00'],
    ['0.01', '0.5', '0.01'],
    ['100000', '100000', '10000000000.00'],
    ['120.5', '42', '5061.00'],
    ['abc', '42', null],
  ])('%s x %s = %s', (qty, price, expected) => {
    expect(multiplyMoney(qty, price)).toBe(expected);
  });

  it('gives exact results where floating point would not', () => {
    // 1.1 * 3 is 3.3000000000000003 in floating point.
    expect(multiplyMoney('1.1', '3')).toBe('3.30');
    expect(1.1 * 3).not.toBe(3.3);
    expect(multiplyMoney('0.7', '0.1')).toBe('0.07');
  });

  it('accepts API numbers', () => {
    expect(multiplyMoney(2.5, 112.56)).toBe('281.40');
  });
});

describe('toHundredths, sameDecimal and toDecimalText', () => {
  it('reads strings and numbers', () => {
    expect(toHundredths('40.5')).toBe(4050n);
    expect(toHundredths(40.1)).toBe(4010n);
    expect(toHundredths('1.234')).toBeNull();
    expect(toHundredths(-1)).toBeNull();
    expect(toHundredths(Number.NaN)).toBeNull();
  });

  it('compares amounts, not text', () => {
    expect(sameDecimal('40.50', 40.5)).toBe(true);
    expect(sameDecimal('40', 40)).toBe(true);
    expect(sameDecimal('40.01', 40)).toBe(false);
    expect(sameDecimal('x', 40)).toBe(false);
  });

  it('turns API numbers into input text', () => {
    expect(toDecimalText(40)).toBe('40');
    expect(toDecimalText(40.5)).toBe('40.5');
    expect(toDecimalText(120.25)).toBe('120.25');
    expect(toDecimalText(0)).toBe('0');
    expect(toDecimalText(100)).toBe('100');
    expect(toDecimalText(null)).toBe('');
  });
});
