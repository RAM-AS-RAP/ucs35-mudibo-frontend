import { describe, expect, it } from 'vitest';
import {
  acceptInviteSchema,
  changePasswordSchema,
  isCodeComplete,
  loginSchema,
  normalizeCode,
  normalizePhone,
  passwordProblems,
  registerSchema,
  resetPasswordSchema,
} from './validation';

const STRONG = 'Mavuno#2026';

/** Field paths with an issue, from a Zod safeParse. */
function issuesOf(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return {};
  /** @type {Record<string, string>} */
  const first = {};
  for (const issue of result.error.issues) first[issue.path.join('.')] ??= issue.message;
  return first;
}

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

describe('codes', () => {
  it('normalises case, spaces and hyphens', () => {
    expect(normalizeCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeCode(' ab cd efgh ')).toBe('ABCDEFGH');
    expect(isCodeComplete('abcd-2345')).toBe(true);
    expect(isCodeComplete('ABCD234')).toBe(false);
    expect(isCodeComplete('ABCD-23456')).toBe(false);
  });
});

describe('passwordProblems', () => {
  const ids = (password, context) => passwordProblems(password, context).map((p) => p.id);

  it('uses 8 characters for farmers and buyers and 12 for admins, at most 128', () => {
    expect(ids('Abcdef1!', { role: 'farmer' })).toEqual([]);
    expect(ids('Abcde1!', { role: 'buyer' })).toEqual(['length']);
    expect(ids('Abcdef1!xyz', { role: 'admin' })).toEqual(['length']);
    expect(ids('Abcdef1!xyz9', { role: 'admin' })).toEqual([]);
    expect(ids(`A1!${'a'.repeat(126)}`, { role: 'farmer' })).toEqual(['length']);
  });

  it('checks the character classes only when asked (registration and change)', () => {
    expect(ids('alllowercase', {})).toEqual([]);
    expect(ids('alllowercase', { characterClasses: true })).toEqual(['upper', 'digit', 'symbol']);
    expect(ids('ALLUPPER123!', { characterClasses: true })).toEqual(['lower']);
  });

  it('rejects the email, its local part, the name and the phone, case insensitively', () => {
    const context = {
      email: 'Wanjiku.Kamau@Example.com',
      name: 'Wanjiku Kamau',
      phone: '0712345678',
    };
    expect(ids('wanjiku.kamau@example.com', context)).toEqual(['personal']);
    expect(ids('WANJIKU.KAMAU', context)).toEqual(['personal']);
    expect(ids('wanjiku kamau', context)).toEqual(['personal']);
    expect(ids('0712345678', context)).toEqual(['personal']);
    expect(ids('254712345678', context)).toEqual(['personal']);
    expect(ids('Wanjiku Kamau 2026', context)).toEqual([]);
  });
});

describe('form schemas', () => {
  const register = {
    role: 'farmer',
    name: 'Wanjiku Kamau',
    phone: '0712345678',
    email: '',
    password: STRONG,
    confirmPassword: STRONG,
  };

  it('accepts a valid registration, with or without an email', () => {
    expect(issuesOf(registerSchema, register)).toEqual({});
    expect(issuesOf(registerSchema, { ...register, email: 'w@example.com' })).toEqual({});
  });

  it.each([
    [{ role: '' }, 'role', 'Choose whether you are a farmer or a buyer.'],
    [{ role: 'admin' }, 'role', 'Choose whether you are a farmer or a buyer.'],
    [{ name: '' }, 'name', 'Enter your full name.'],
    [{ name: ' W ' }, 'name', 'Your name needs at least 2 characters.'],
    [{ name: 'x'.repeat(101) }, 'name', 'Your name can have at most 100 characters.'],
    [{ phone: '' }, 'phone', 'Enter your phone number.'],
    [{ phone: '0812345678' }, 'phone', 'Enter a Kenyan mobile number, for example 0712 345 678.'],
    [
      { email: 'not-an-email' },
      'email',
      'Enter a valid email address, for example name@example.com.',
    ],
    [
      { password: 'Ab1!', confirmPassword: 'Ab1!' },
      'password',
      'The password does not meet the requirements below.',
    ],
    [
      { password: 'nouppercase1!', confirmPassword: 'nouppercase1!' },
      'password',
      'The password does not meet the requirements below.',
    ],
    [
      { phone: '0712345678', password: '0712345678', confirmPassword: '0712345678' },
      'password',
      'The password does not meet the requirements below.',
    ],
    [
      {
        email: 'Mavuno#2026@x.co',
        password: 'Mavuno#2026@x.co',
        confirmPassword: 'Mavuno#2026@x.co',
      },
      'password',
      'The password does not meet the requirements below.',
    ],
    [
      { name: 'Mavuno#2026', password: 'Mavuno#2026', confirmPassword: 'Mavuno#2026' },
      'password',
      'The password does not meet the requirements below.',
    ],
    [{ confirmPassword: 'Different#1' }, 'confirmPassword', 'The passwords do not match.'],
    [{ confirmPassword: '' }, 'confirmPassword', 'Enter the password again.'],
  ])('registration %j fails on %s', (change, field, message) => {
    expect(issuesOf(registerSchema, { ...register, ...change })[field]).toBe(message);
  });

  it('reports field and password problems together', () => {
    const issues = issuesOf(registerSchema, { ...register, name: '', password: 'short' });
    expect(Object.keys(issues)).toEqual(expect.arrayContaining(['name', 'password']));
  });

  it('login needs an identifier of 3 or more characters and a password', () => {
    expect(issuesOf(loginSchema, { identifier: '', password: '' })).toEqual({
      identifier: 'Enter your phone number or email.',
      password: 'Enter your password.',
    });
    expect(issuesOf(loginSchema, { identifier: 'ab', password: 'x' }).identifier).toBe(
      'Enter at least 3 characters.',
    );
  });

  it('reset needs 8 characters, the invitation 12', () => {
    const base = { email: 'a@example.com', code: 'ABCD-2345' };
    const eleven = { password: 'mavuno-2026', confirmPassword: 'mavuno-2026' };
    expect(issuesOf(resetPasswordSchema, { ...base, ...eleven })).toEqual({});
    expect(issuesOf(acceptInviteSchema, { ...base, ...eleven }).password).toBe(
      'The password does not meet the requirements below.',
    );
    expect(
      issuesOf(acceptInviteSchema, {
        ...base,
        password: 'mavuno-harvest',
        confirmPassword: 'mavuno-harvest',
      }),
    ).toEqual({});
    expect(issuesOf(resetPasswordSchema, { ...base, ...eleven, code: 'ABC' }).code).toBe(
      'The code has 8 letters and numbers, for example ABCD-2345.',
    );
  });

  it('change password: role based minimum and different from the current one', () => {
    const values = { currentPassword: 'Old#Pass1', newPassword: STRONG, confirmPassword: STRONG };
    expect(issuesOf(changePasswordSchema({ role: 'farmer' }), values)).toEqual({});
    expect(issuesOf(changePasswordSchema({ role: 'admin' }), values).newPassword).toBe(
      'The password does not meet the requirements below.',
    );
    expect(
      issuesOf(changePasswordSchema({ role: 'farmer' }), { ...values, currentPassword: STRONG })
        .newPassword,
    ).toBe('The new password must be different from your current password.');
  });
});
