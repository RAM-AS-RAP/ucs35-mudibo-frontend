/**
 * Client side validation for the authentication forms. It mirrors the backend so people get
 * feedback before submitting, but the server stays the authority: a 422 from it is shown on
 * the matching field. The server's common password list is deliberately not copied.
 */
import { z } from 'zod';
import { MESSAGES } from './messages';

const M = MESSAGES.field;

export const PASSWORD_MAX = 128;
export const PASSWORD_MIN_USER = 8;
export const PASSWORD_MIN_ADMIN = 12;
export const CODE_LENGTH = 8;

const KENYAN_MOBILE = /^254[17]\d{8}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalise a Kenyan mobile number the way the server does: strip spaces and dashes,
 * accept 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX (and the 2541 forms).
 * @param {unknown} raw
 * @returns {string | null}  254XXXXXXXXX, or null when the number is not accepted
 */
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let value = raw.replace(/[\s-]/g, '');
  if (value.startsWith('+')) value = value.slice(1);
  if (value.startsWith('0') && value.length === 10) value = `254${value.slice(1)}`;
  return KENYAN_MOBILE.test(value) ? value : null;
}

/** @param {unknown} value */
export function isEmail(value) {
  return typeof value === 'string' && EMAIL.test(value.trim());
}

/**
 * Normalise a one time code as the server does (upper case, no spaces or hyphens).
 * @param {string} raw
 */
export function normalizeCode(raw) {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}

/** @param {string} raw */
export function isCodeComplete(raw) {
  return new RegExp(`^[A-Z0-9]{${CODE_LENGTH}}$`).test(normalizeCode(raw));
}

/** @param {string | null | undefined} role */
export function minPasswordLength(role) {
  return role === 'admin' ? PASSWORD_MIN_ADMIN : PASSWORD_MIN_USER;
}

/**
 * @typedef {'length' | 'upper' | 'lower' | 'digit' | 'symbol' | 'personal'} PasswordRule
 * @typedef {{ id: PasswordRule, label: string }} PasswordRequirement
 */

/**
 * The requirements that apply to a password.
 * `characterClasses` adds the upper, lower, digit and symbol rules the backend enforces on
 * registration and on POST /auth/change-password (not on reset or invite acceptance).
 * @param {{ role?: string | null, characterClasses?: boolean }} options
 * @returns {PasswordRequirement[]}
 */
export function passwordRequirements({ role, characterClasses = false }) {
  const P = MESSAGES.password;
  /** @type {PasswordRequirement[]} */
  const list = [{ id: 'length', label: P.length(minPasswordLength(role)) }];
  if (characterClasses) {
    list.push(
      { id: 'upper', label: P.upper },
      { id: 'lower', label: P.lower },
      { id: 'digit', label: P.digit },
      { id: 'symbol', label: P.symbol },
    );
  }
  list.push({ id: 'personal', label: P.personal });
  return list;
}

/**
 * The unmet requirements of a password, in checklist order.
 * The personal rule compares case insensitively with the email, the part of the email before
 * "@", the name and the phone number (as typed and normalised).
 * @param {string} password
 * @param {{ role?: string | null, email?: string | null, name?: string | null, phone?: string | null, characterClasses?: boolean }} [context]
 * @returns {PasswordRequirement[]}
 */
export function passwordProblems(password, context = {}) {
  const { role, email, name, phone, characterClasses = false } = context;
  const value = password ?? '';
  const min = minPasswordLength(role);
  const lowered = value.trim().toLowerCase();

  const personal = new Set();
  const addPersonal = (/** @type {unknown} */ v) => {
    if (typeof v === 'string' && v.trim()) personal.add(v.trim().toLowerCase());
  };
  if (email) {
    addPersonal(email);
    addPersonal(email.trim().split('@', 1)[0]);
  }
  addPersonal(name);
  addPersonal(phone);
  addPersonal(normalizePhone(phone ?? ''));

  /** @type {Record<PasswordRule, boolean>} */
  const ok = {
    length: value.length >= min && value.length <= PASSWORD_MAX,
    upper: /\p{Lu}/u.test(value),
    lower: /\p{Ll}/u.test(value),
    digit: /\p{Nd}/u.test(value),
    symbol: /[^\p{L}\p{N}\s]/u.test(value),
    personal: !(lowered && personal.has(lowered)),
  };
  return passwordRequirements({ role, characterClasses }).filter((req) => !ok[req.id]);
}

// ---------------------------------------------------------------------------------------------
// Zod schemas, one per form.

const requiredEmail = z
  .string()
  .trim()
  .min(1, M.emailRequired)
  .refine((v) => EMAIL.test(v), M.emailInvalid);

const code = z
  .string()
  .trim()
  .min(1, M.codeRequired)
  .refine((v) => isCodeComplete(v), M.codeInvalid);

/**
 * Adds the password problems and the confirmation check to a form schema.
 * @param {{ passwordKey: string, confirmKey: string, contextOf: (data: any) => Parameters<typeof passwordProblems>[1] }} options
 */
function refinePassword({ passwordKey, confirmKey, contextOf }) {
  return (/** @type {any} */ data, /** @type {z.RefinementCtx} */ ctx) => {
    const password = data[passwordKey] ?? '';
    if (!password) {
      ctx.addIssue({ code: 'custom', path: [passwordKey], message: M.passwordRequired });
    } else if (passwordProblems(password, contextOf(data)).length > 0) {
      ctx.addIssue({ code: 'custom', path: [passwordKey], message: M.passwordWeak });
    }
    const confirm = data[confirmKey] ?? '';
    if (!confirm) {
      ctx.addIssue({ code: 'custom', path: [confirmKey], message: M.confirmRequired });
    } else if (password && confirm !== password) {
      ctx.addIssue({ code: 'custom', path: [confirmKey], message: M.confirmMismatch });
    }
  };
}

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, M.identifierRequired).min(3, M.identifierShort),
  password: z.string().min(1, M.passwordRequired),
});

export const registerSchema = z
  .object({
    role: z.string().refine((v) => v === 'farmer' || v === 'buyer', M.roleRequired),
    name: z.string().trim().min(1, M.nameRequired).min(2, M.nameShort).max(100, M.nameLong),
    phone: z
      .string()
      .trim()
      .min(1, M.phoneRequired)
      .refine((v) => normalizePhone(v) !== null, M.phoneInvalid),
    email: z
      .string()
      .trim()
      .refine((v) => v === '' || EMAIL.test(v), M.emailInvalid),
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine(
    refinePassword({
      passwordKey: 'password',
      confirmKey: 'confirmPassword',
      contextOf: (d) => ({
        role: d.role,
        email: d.email,
        name: d.name,
        phone: d.phone,
        characterClasses: true,
      }),
    }),
  );

export const forgotPasswordSchema = z.object({ email: requiredEmail });

export const resetPasswordSchema = z
  .object({
    email: requiredEmail,
    code,
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine(
    refinePassword({
      passwordKey: 'password',
      confirmKey: 'confirmPassword',
      contextOf: (d) => ({ role: null, email: d.email }),
    }),
  );

export const acceptInviteSchema = z
  .object({
    email: requiredEmail,
    code,
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine(
    refinePassword({
      passwordKey: 'password',
      confirmKey: 'confirmPassword',
      contextOf: (d) => ({ role: 'admin', email: d.email }),
    }),
  );

/**
 * The change password schema depends on the signed in role (12 characters for admin).
 * @param {{ role?: string | null, name?: string | null }} session
 */
export function changePasswordSchema({ role, name }) {
  return z
    .object({
      currentPassword: z.string().min(1, M.currentPasswordRequired),
      newPassword: z.string(),
      confirmPassword: z.string(),
    })
    .superRefine(
      refinePassword({
        passwordKey: 'newPassword',
        confirmKey: 'confirmPassword',
        contextOf: () => ({ role, name, characterClasses: true }),
      }),
    )
    .superRefine((data, ctx) => {
      if (data.newPassword && data.newPassword === data.currentPassword) {
        ctx.addIssue({ code: 'custom', path: ['newPassword'], message: M.sameAsCurrent });
      }
    });
}
