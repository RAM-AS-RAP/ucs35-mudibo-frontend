import { describe, expect, it } from 'vitest';
import {
  acceptInviteSchema,
  changePasswordSchema,
  emailSchema,
  inviteSchema,
  isPlausibleCode,
  loginSchema,
  normalizeCode,
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

describe('codes', () => {
  it('normalises case, spaces and hyphens', () => {
    expect(normalizeCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeCode(' ab cd efgh ')).toBe('ABCDEFGH');
    expect(isPlausibleCode('abcd-2345')).toBe(true);
    expect(isPlausibleCode('ABCD234')).toBe(false);
    expect(isPlausibleCode('ABCD-23456')).toBe(false);
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

  it('rejects the email, its local part and the name, case insensitively', () => {
    const context = { email: 'Wanjiku.Kamau@Example.com', name: 'Wanjiku Kamau' };
    expect(ids('wanjiku.kamau@example.com', context)).toEqual(['personal']);
    expect(ids('WANJIKU.KAMAU', context)).toEqual(['personal']);
    expect(ids('wanjiku kamau', context)).toEqual(['personal']);
    expect(ids('Wanjiku Kamau 2026', context)).toEqual([]);
  });

  it('has no phone rule any more', () => {
    // A phone number is an ordinary password now (it is not part of any account).
    expect(ids('0712345678', { email: 'a@b.co', phone: '0712345678' })).toEqual([]);
    expect(
      passwordProblems('x', {})
        .map((p) => p.label)
        .join(' '),
    ).not.toMatch(/phone/i);
  });
});

describe('form schemas', () => {
  const register = {
    role: 'farmer',
    name: 'Wanjiku Kamau',
    email: 'wanjiku@example.com',
    password: STRONG,
    confirmPassword: STRONG,
  };

  it('accepts a valid registration and requires the email', () => {
    expect(issuesOf(registerSchema, register)).toEqual({});
    expect(issuesOf(registerSchema, { ...register, email: '' }).email).toBe(
      'Enter your email address.',
    );
  });

  it.each([
    [{ role: '' }, 'role', 'Choose whether you are a farmer or a buyer.'],
    [{ role: 'admin' }, 'role', 'Choose whether you are a farmer or a buyer.'],
    [{ name: '' }, 'name', 'Enter your full name.'],
    [{ name: ' W ' }, 'name', 'Your name needs at least 2 characters.'],
    [{ name: 'x'.repeat(101) }, 'name', 'Your name can have at most 100 characters.'],
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

  it('login needs an email and a password', () => {
    expect(issuesOf(loginSchema, { email: '', password: '' })).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    });
    expect(issuesOf(loginSchema, { email: 'ab', password: 'x' }).email).toBe(
      'Enter a valid email address, for example name@example.com.',
    );
    expect(loginSchema.parse({ email: ' Wanjiku@Example.COM ', password: 'x' }).email).toBe(
      'wanjiku@example.com',
    );
  });

  it('invitation needs a name and an email, and has no phone field', () => {
    expect(issuesOf(inviteSchema, { name: 'New Admin', email: 'new@example.com' })).toEqual({});
    expect(Object.keys(inviteSchema.shape)).toEqual(['name', 'email']);
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

describe('emailSchema', () => {
  it.each([
    ['wanjiku@example.com', 'wanjiku@example.com'],
    ['  Wanjiku@Example.COM  ', 'wanjiku@example.com'],
    ['A.B+tag@sub.example.co.ke', 'a.b+tag@sub.example.co.ke'],
  ])('accepts %j as %j (trimmed, lower cased)', (raw, expected) => {
    expect(emailSchema.parse(raw)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'wanjiku',
    'wanjiku@',
    '@example.com',
    'wanjiku@example',
    'a b@example.com',
    'a@b@c.com',
  ])('rejects %j', (raw) => {
    expect(emailSchema.safeParse(raw).success).toBe(false);
  });

  it('allows at most 254 characters', () => {
    const at254 = `${'a'.repeat(242)}@example.com`;
    expect(at254).toHaveLength(254);
    expect(emailSchema.safeParse(at254).success).toBe(true);
    const result = emailSchema.safeParse(`a${at254}`);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'An email address can have at most 254 characters.',
    );
  });
});
