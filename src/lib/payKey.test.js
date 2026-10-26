import { describe, expect, it } from 'vitest';
import { isValidIdempotencyKey } from './idempotency';
import { createPayKey } from './payKey';

describe('createPayKey', () => {
  it('starts empty', () => {
    const holder = createPayKey();
    expect(holder).toMatchObject({ key: null, phone: null, uncertain: false });
  });

  it('makes a valid key for the normalised number', () => {
    const holder = createPayKey();
    const attempt = holder.begin('0712 345 678');
    expect(isValidIdempotencyKey(attempt.key)).toBe(true);
    expect(attempt.phone).toBe('254712345678');
    expect(holder.key).toBe(attempt.key);
    expect(holder.phone).toBe('254712345678');
  });

  it('makes a new key for every new attempt', () => {
    const holder = createPayKey();
    const first = holder.begin('0712345678').key;
    const second = holder.begin('0712345678').key;
    expect(second).not.toBe(first);
  });

  it('keeps the key only when the result was unknown and the number is unchanged', () => {
    const holder = createPayKey();
    const first = holder.begin('0712 345 678').key;
    holder.markUncertain();
    expect(holder.uncertain).toBe(true);
    // The same number in another format normalises to the same value.
    expect(holder.begin('+254712345678').key).toBe(first);
    expect(holder.uncertain).toBe(true);
  });

  it('always makes a new key for a changed number, even when uncertain', () => {
    const holder = createPayKey();
    const first = holder.begin('0712345678').key;
    holder.markUncertain();
    const second = holder.begin('0722000111');
    expect(second.key).not.toBe(first);
    expect(second.phone).toBe('254722000111');
    expect(holder.uncertain).toBe(false);
  });

  it('clear empties the key, the number and the uncertain flag', () => {
    const holder = createPayKey();
    const first = holder.begin('0712345678').key;
    holder.markUncertain();
    holder.clear();
    expect(holder).toMatchObject({ key: null, phone: null, uncertain: false });
    expect(holder.begin('0712345678').key).not.toBe(first);
  });

  it('markUncertain without a key does nothing', () => {
    const holder = createPayKey();
    holder.markUncertain();
    expect(holder.uncertain).toBe(false);
  });

  it('refuses an invalid number without naming it', () => {
    const holder = createPayKey();
    let thrown = /** @type {unknown} */ (null);
    try {
      holder.begin('0712');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TypeError);
    expect(String(/** @type {Error} */ (thrown).message)).not.toContain('0712');
    expect(holder.key).toBeNull();
  });

  it('uses the injected key maker', () => {
    let n = 0;
    const holder = createPayKey({ newKey: () => `key-number-${(n += 1)}` });
    expect(holder.begin('0712345678').key).toBe('key-number-1');
    expect(holder.begin('0712345678').key).toBe('key-number-2');
  });
});
