import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, isPlausibleCode, normalizeCode } from './codes';

describe('normalizeCode', () => {
  it.each([
    ['abcd-2345', 'ABCD2345'],
    ['ABCD2345', 'ABCD2345'],
    [' ab cd 23 45 ', 'ABCD2345'],
    ['abcd - 2345', 'ABCD2345'],
    ['a-b-c-d-2-3-4-5', 'ABCD2345'],
    ['', ''],
  ])('%j gives %j', (raw, expected) => {
    expect(normalizeCode(raw)).toBe(expected);
  });

  it('gives an empty string for anything that is not a string', () => {
    expect(normalizeCode(undefined)).toBe('');
    expect(normalizeCode(12345678)).toBe('');
  });
});

describe('isPlausibleCode', () => {
  it('has codes of 8 characters', () => expect(CODE_LENGTH).toBe(8));

  it.each([
    ['ABCD-2345', true],
    ['abcd2345', true],
    [' abcd 2345 ', true],
    ['ABCD-234', false],
    ['ABCD-23456', false],
    ['ABCD_2345', false],
    ['ABCD-23!5', false],
    ['ÄBCD-2345', false],
    ['', false],
  ])('%j is %s', (raw, expected) => {
    expect(isPlausibleCode(raw)).toBe(expected);
  });
});
