import { describe, expect, it } from 'vitest';
import { targetDiffers } from './paymentView';

describe('targetDiffers', () => {
  it.each([
    ['different', { phone_masked: '254*******678', stk_target_masked: '254*******149' }, true],
    ['equal', { phone_masked: '254*******149', stk_target_masked: '254*******149' }, false],
    ['no number entered', { phone_masked: null, stk_target_masked: '254*******149' }, false],
    ['no target', { phone_masked: '254*******678', stk_target_masked: null }, false],
    ['empty strings', { phone_masked: '', stk_target_masked: '254*******149' }, false],
    ['missing fields', {}, false],
    ['no payment', null, false],
    ['undefined', undefined, false],
  ])('%s gives %s', (_name, payment, expected) => {
    expect(targetDiffers(/** @type {any} */ (payment))).toBe(expected);
  });
});
