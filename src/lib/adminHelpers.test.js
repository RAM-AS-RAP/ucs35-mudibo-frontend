// Unit tests of the administrator helpers (F4).
import { describe, expect, it } from 'vitest';
import { ApiError, ERROR_MESSAGES, getUserMessage } from '@/api/errors';
import { canToggleUser } from './userActions';
import {
  describeEffect,
  describeReason,
  GENERIC_REASON,
  PAYMENT_RECORD_NOTE,
} from './reconciliation';
import {
  formatCount,
  formatPctValue,
  formatRate,
  horizonLabel,
  NOT_ENOUGH_DATA,
} from './accuracyFormat';
import { DATE_RANGE_TEXT, isIsoDate, validateDateRange } from './dateRange';
import {
  ADMIN_ERROR_MESSAGES,
  adminErrorMessage,
  EMAIL_FAILURE_MESSAGES,
  emailFailureMessage,
  isUnknownWriteResult,
} from './adminMessages';

describe('canToggleUser', () => {
  const superActor = { id: 'super', isSuperAdmin: true };
  const adminActor = { id: 'admin-1', isSuperAdmin: false };
  const target = (/** @type {Record<string, any>} */ o) => ({
    id: 'x',
    role: 'farmer',
    is_super_admin: false,
    ...o,
  });

  it.each([
    // actor, target, expected
    ['main admin', 'farmer', superActor, target({ role: 'farmer' }), true],
    ['main admin', 'buyer', superActor, target({ role: 'buyer' }), true],
    ['main admin', 'another admin', superActor, target({ role: 'admin' }), true],
    [
      'main admin',
      'own row',
      superActor,
      target({ id: 'super', role: 'admin', is_super_admin: true }),
      false,
    ],
    [
      'main admin',
      'own row (flag missing)',
      superActor,
      target({ id: 'super', role: 'admin' }),
      false,
    ],
    ['ordinary admin', 'farmer', adminActor, target({ role: 'farmer' }), true],
    ['ordinary admin', 'buyer', adminActor, target({ role: 'buyer' }), true],
    ['ordinary admin', 'another admin', adminActor, target({ role: 'admin' }), false],
    [
      'ordinary admin',
      'main admin',
      adminActor,
      target({ role: 'admin', is_super_admin: true }),
      false,
    ],
    ['ordinary admin', 'own row', adminActor, target({ id: 'admin-1', role: 'admin' }), false],
    ['ordinary admin', 'unknown role', adminActor, target({ role: 'robot' }), false],
    [
      'main admin',
      'super admin row of someone else',
      superActor,
      target({ role: 'admin', is_super_admin: true }),
      false,
    ],
  ])('%s acting on %s', (_actor, _target, actor, row, expected) => {
    expect(canToggleUser({ actor, target: row })).toBe(expected);
  });

  it('is false without an actor or a target, and when the profile id is unknown the rules still hold', () => {
    expect(canToggleUser({ actor: null, target: target({}) })).toBe(false);
    expect(canToggleUser({ actor: superActor, target: null })).toBe(false);
    const noId = { id: null, isSuperAdmin: false };
    expect(canToggleUser({ actor: noId, target: target({ role: 'farmer' }) })).toBe(true);
    expect(canToggleUser({ actor: noId, target: target({ role: 'admin' }) })).toBe(false);
  });
});

describe('describeReason', () => {
  it.each([
    ['late_success_after_expiry', /arrived after this order had expired/],
    ['success_on_closed_payment', /already been closed/],
    ['success_on_closed_order', /after this order had been closed/],
    ['amount_mismatch', /did not match the order total/],
  ])('%s has its own sentence', (reason, pattern) => {
    const text = describeReason(reason);
    expect(text).toMatch(pattern);
    expect(text).not.toBe(GENERIC_REASON);
    // Never claims certainty about money.
    expect(text).not.toMatch(/\b(definitely|certainly|was charged|has paid)\b/i);
  });

  it('uses the expected sentence for a late payment', () => {
    expect(describeReason('late_success_after_expiry')).toBe(
      'A payment confirmation arrived after this order had expired. The produce may already have been released to other buyers.',
    );
  });

  it.each([null, undefined, '', 'something_new'])('falls back for %s', (reason) => {
    expect(describeReason(/** @type {any} */ (reason))).toBe(GENERIC_REASON);
  });
});

describe('describeEffect', () => {
  const CONFIRM_RESERVED = 'The order becomes paid. The reserved produce stays with this buyer.';
  const CONFIRM_RELEASED =
    'The order becomes paid and the produce is reserved for this buyer again, if enough is left in the listing.';
  const VOID_RESERVED = 'The order is cancelled and the reserved produce goes back to the listing.';
  const VOID_RELEASED =
    'The order is cancelled. The produce was already released, so the listing does not change.';

  it.each([
    ['confirm_sale', 'pending_payment', CONFIRM_RESERVED],
    ['confirm_sale', 'expired', CONFIRM_RELEASED],
    ['confirm_sale', 'cancelled', CONFIRM_RELEASED],
    ['confirm_sale', 'payment_failed', CONFIRM_RELEASED],
    ['void_order', 'pending_payment', VOID_RESERVED],
    ['void_order', 'expired', VOID_RELEASED],
    ['void_order', 'cancelled', VOID_RELEASED],
    ['void_order', 'payment_failed', VOID_RELEASED],
  ])('%s before %s', (action, before, effect) => {
    expect(describeEffect(/** @type {any} */ (action), before)).toEqual([
      effect,
      PAYMENT_RECORD_NOTE,
    ]);
  });

  it.each(['confirm_sale', 'void_order'])(
    '%s with an unknown previous status stays general',
    (action) => {
      const lines = describeEffect(/** @type {any} */ (action), null);
      expect(lines).toHaveLength(2);
      expect(lines[1]).toBe(PAYMENT_RECORD_NOTE);
      expect(lines[0]).not.toBe(CONFIRM_RESERVED);
      expect(lines[0]).not.toBe(VOID_RESERVED);
    },
  );

  it('always ends with the payment record and refund note', () => {
    expect(PAYMENT_RECORD_NOTE).toBe(
      'The payment record stays as it is. Any refund must be handled outside AgriSence.',
    );
  });
});

describe('accuracyFormat', () => {
  it.each([null, undefined, NaN, Infinity, '', 'abc'])('formats %s as "Not enough data"', (v) => {
    expect(formatPctValue(v)).toBe(NOT_ENOUGH_DATA);
    expect(formatRate(v)).toBe(NOT_ENOUGH_DATA);
    expect(formatCount(v)).toBe(NOT_ENOUGH_DATA);
  });

  it('formats zero and normal values, never NaN', () => {
    expect(formatPctValue(0)).toBe('0.0%');
    expect(formatPctValue(4.56)).toBe('4.6%');
    expect(formatPctValue('12.3')).toBe('12.3%');
    expect(formatRate(0)).toBe('0.0%');
    expect(formatRate(0.625)).toBe('62.5%');
    expect(formatRate(1)).toBe('100.0%');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(7)).toBe('7');
    for (const text of [formatPctValue(1), formatRate(0.5), formatCount(3)]) {
      expect(text).not.toMatch(/NaN|null|undefined/);
    }
  });

  it('labels the horizons', () => {
    expect(horizonLabel('one_month')).toBe('1 month');
    expect(horizonLabel('two_month')).toBe('2 months');
    expect(horizonLabel('three_month')).toBe('three month');
    expect(horizonLabel(null)).toBe('Unknown horizon');
  });
});

describe('dateRange', () => {
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(isIsoDate('2026-10-01')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '01/10/2026', '', null, 20261001]) {
      expect(isIsoDate(bad)).toBe(false);
    }
  });

  it('allows empty, one sided and ordered ranges', () => {
    expect(validateDateRange({ from: '', to: '' })).toEqual({ ok: true, from: null, to: null });
    expect(validateDateRange({ from: '2026-10-01', to: null })).toEqual({
      ok: true,
      from: '2026-10-01',
      to: null,
    });
    expect(validateDateRange({ from: '2026-10-01', to: '2026-10-01' }).ok).toBe(true);
    expect(validateDateRange({ from: '2026-09-30', to: '2026-10-01' }).ok).toBe(true);
  });

  it('rejects a start after the end and invalid dates', () => {
    expect(validateDateRange({ from: '2026-10-02', to: '2026-10-01' })).toEqual({
      ok: false,
      field: 'from',
      error: DATE_RANGE_TEXT.reversed,
    });
    expect(validateDateRange({ from: '2026-02-30', to: '' })).toMatchObject({
      ok: false,
      field: 'from',
    });
    expect(validateDateRange({ from: '', to: 'tomorrow' })).toMatchObject({
      ok: false,
      field: 'to',
    });
  });
});

describe('admin error messages', () => {
  const ADMIN_CODES = [
    'user_not_found',
    'cannot_modify_super_admin',
    'cannot_disable_self',
    'forbidden',
    'user_exists',
    'too_many_pending_invites',
    'invite_not_pending',
    'resend_cooldown',
    'send_limit_reached',
    'email_failed',
    'listing_not_found',
    'listing_has_open_payments',
    'order_not_found',
    'order_not_in_reconciliation',
    'reconciliation_context_missing',
    'insufficient_stock_to_confirm',
    'payment_not_found',
  ];

  it.each(ADMIN_CODES)('%s has an admin message and a general one', (code) => {
    expect(ADMIN_ERROR_MESSAGES).toHaveProperty(code);
    expect(ERROR_MESSAGES).toHaveProperty(code);
  });

  it('uses the wording of the task for the key codes', () => {
    const msg = (/** @type {string} */ code, options = {}) =>
      adminErrorMessage(new ApiError({ status: 409, code }), options);
    expect(msg('cannot_modify_super_admin')).toBe(
      'The main administrator account cannot be changed.',
    );
    expect(msg('cannot_disable_self')).toBe('You cannot disable your own account.');
    expect(msg('forbidden', { userAction: true })).toBe(
      'Only the main administrator can change another administrator.',
    );
    expect(msg('listing_has_open_payments')).toBe(
      'A payment is in progress for this listing. Try again in a few minutes.',
    );
    expect(msg('order_not_in_reconciliation')).toBe('This order is no longer waiting for review.');
    expect(msg('reconciliation_context_missing')).toBe(
      'The record needed to resolve this order is missing. Do not change the order here; check the payment events.',
    );
  });

  it('keeps the general meaning of forbidden outside a disable or enable', () => {
    const error = new ApiError({ status: 403, code: 'forbidden' });
    expect(adminErrorMessage(error)).toBe(getUserMessage(error));
  });

  it('counts down resend_cooldown with Retry-After', () => {
    const error = new ApiError({ status: 429, code: 'resend_cooldown', retryAfter: 42 });
    expect(adminErrorMessage(error)).toBe('Wait 42 seconds before sending another code.');
  });

  it.each(Object.entries(EMAIL_FAILURE_MESSAGES))(
    'email_failed with category %s has its message',
    (category, message) => {
      const error = new ApiError({ status: 502, code: 'email_failed', extra: { category } });
      expect(emailFailureMessage(error)).toBe(message);
      expect(adminErrorMessage(error)).toBe(message);
    },
  );

  it('email_failed without a known category says the email could not be sent', () => {
    const unknown = new ApiError({ status: 502, code: 'email_failed', extra: { category: 'new' } });
    expect(emailFailureMessage(unknown)).toBe('The email could not be sent.');
    expect(emailFailureMessage(new Error('x'))).toBe('The email could not be sent.');
  });

  it('falls back to the general message for other codes', () => {
    const error = new ApiError({ status: 500, code: 'internal_error' });
    expect(adminErrorMessage(error)).toBe(getUserMessage(error));
    expect(adminErrorMessage(new Error('boom'))).toBe(getUserMessage(new Error('boom')));
  });

  it('knows when a write result is unknown', () => {
    expect(isUnknownWriteResult(new ApiError({ status: 0, code: 'timeout' }))).toBe(true);
    expect(isUnknownWriteResult(new ApiError({ status: 0, code: 'network_error' }))).toBe(true);
    expect(isUnknownWriteResult(new ApiError({ status: 500, code: 'internal_error' }))).toBe(false);
  });
});
