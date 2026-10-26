import { describe, expect, it } from 'vitest';
import { formatPhoneLocal, normalizePhone, PHONE_FIELD_TEXT, phoneFieldError } from './phone';

// The F1 normaliser, moved here from validation.js with its behaviour and tests unchanged.
describe('normalizePhone', () => {
  it.each([
    ['0712345678', '254712345678'],
    ['0112345678', '254112345678'],
    ['+254712345678', '254712345678'],
    ['254712345678', '254712345678'],
    ['+254112345678', '254112345678'],
    ['254112345678', '254112345678'],
    ['0712 345 678', '254712345678'],
    ['0712-345-678', '254712345678'],
    [' +254 712 345 678 ', '254712345678'],
  ])('accepts %j as %j', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([
    '',
    '071234567',
    '07123456789',
    '0812345678',
    '0212345678',
    '254812345678',
    '+1 712 345 678',
    '712345678',
    '07123x5678',
    '(0712) 345678',
  ])('rejects %j', (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });

  it('rejects non strings', () => {
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone(712345678)).toBeNull();
  });
});

describe('formatPhoneLocal', () => {
  it.each([
    ['254712345678', '0712 345 678'],
    ['254110123456', '0110 123 456'],
    ['254799000111', '0799 000 111'],
  ])('formats %s as %s', (normalized, local) => {
    expect(formatPhoneLocal(normalized)).toBe(local);
  });

  it.each([
    ['0712 345 678', '0712 345 678'],
    ['0712-345-678', '0712 345 678'],
    ['+254712345678', '0712 345 678'],
    ['2547 1234 5678', '0712 345 678'],
    ['0110123456', '0110 123 456'],
    ['254110123456', '0110 123 456'],
  ])('formats each accepted input %s after normalising', (typed, local) => {
    expect(formatPhoneLocal(normalizePhone(typed))).toBe(local);
  });

  it.each([
    ['empty', ''],
    ['not normalised', '0712345678'],
    ['with a plus', '+254712345678'],
    ['255 prefix', '255712345678'],
    ['254 then 2', '254212345678'],
    ['too short', '25471234567'],
    ['too long', '2547123456789'],
    ['null', null],
    ['a number', 254712345678],
  ])('gives null for an invalid value (%s)', (_name, value) => {
    expect(formatPhoneLocal(value)).toBeNull();
  });
});

describe('phoneFieldError', () => {
  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['undefined', undefined],
  ])('asks for the number when it is %s', (_name, raw) => {
    expect(phoneFieldError(raw)).toBe('Enter the M-Pesa number to send the payment prompt to.');
  });

  it.each([
    ['short', '0712 345'],
    ['letters', '07ab 345 678'],
    ['words', 'my number'],
    ['255 prefix', '255712345678'],
    ['+255 prefix', '+255 712 345 678'],
    ['a landline', '020 123 4567'],
    ['too long', '0712 345 6789'],
  ])('rejects %s', (_name, raw) => {
    expect(phoneFieldError(raw)).toBe('Enter a valid Safaricom number, for example 0712 345 678.');
    expect(PHONE_FIELD_TEXT.invalid).toBe(phoneFieldError(raw));
  });

  it.each([
    ['07 start', '0712345678'],
    ['07 start with spaces', '0712 345 678'],
    ['07 start with dashes', '0712-345-678'],
    ['01 start', '0110 123 456'],
    ['+2547 start', '+254 712 345 678'],
    ['2547 start', '254712345678'],
    ['2541 start', '254110123456'],
    ['outer spaces', '  0712 345 678  '],
  ])('accepts %s', (_name, raw) => {
    expect(phoneFieldError(raw)).toBeNull();
  });
});
