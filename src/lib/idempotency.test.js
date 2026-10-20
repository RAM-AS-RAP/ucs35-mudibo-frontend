import { describe, expect, it, vi } from 'vitest';
import { isValidIdempotencyKey, newIdempotencyKey } from './idempotency';

describe('isValidIdempotencyKey', () => {
  it.each(['abcdefgh', 'A1-b2_C3', '0f8fad5b-d9cb-469f-a165-70867728950e', 'x'.repeat(64)])(
    'accepts %s',
    (key) => {
      expect(isValidIdempotencyKey(key)).toBe(true);
    },
  );

  it.each([
    ['too short', 'abcdefg'],
    ['too long', 'x'.repeat(65)],
    ['a space', 'abcd efgh'],
    ['a dot', 'abcd.efgh'],
    ['a slash', 'abcd/efgh'],
    ['non ASCII', 'abcdéfgh'],
    ['empty', ''],
  ])('rejects %s', (_name, key) => {
    expect(isValidIdempotencyKey(key)).toBe(false);
  });

  it('rejects values that are not strings', () => {
    for (const value of [null, undefined, 12345678, {}, []]) {
      expect(isValidIdempotencyKey(value)).toBe(false);
    }
  });
});

describe('newIdempotencyKey', () => {
  it('returns a valid UUID from crypto.randomUUID', () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isValidIdempotencyKey(key)).toBe(true);
  });

  it('is unique across calls', () => {
    const keys = new Set(Array.from({ length: 500 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(500);
  });

  it('falls back to crypto.getRandomValues when randomUUID is missing', () => {
    const getRandomValues = vi.fn((/** @type {Uint8Array} */ bytes) =>
      globalThis.crypto.getRandomValues(bytes),
    );
    const keys = Array.from({ length: 50 }, () =>
      newIdempotencyKey({ crypto: /** @type {any} */ ({ getRandomValues }) }),
    );
    expect(getRandomValues).toHaveBeenCalledTimes(50);
    for (const key of keys) {
      expect(key).toMatch(/^[0-9a-f]{32}$/);
      expect(isValidIdempotencyKey(key)).toBe(true);
    }
    expect(new Set(keys).size).toBe(50);
  });
});
