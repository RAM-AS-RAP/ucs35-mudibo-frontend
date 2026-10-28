/**
 * Client side validation for the authentication forms. It mirrors the backend so people get
 * feedback before submitting, but the server stays the authority: a 422 from it is shown on
 * the matching field. The server's common password list is deliberately not copied.
 */
import { z } from 'zod';
import { CODE_LENGTH, isPlausibleCode, normalizeCode } from './codes';
import { MESSAGES } from './messages';

export { CODE_LENGTH, isPlausibleCode, normalizeCode };

const M = MESSAGES.field;

export const PASSWORD_MAX = 128;
export const PASSWORD_MIN_USER = 8;
export const PASSWORD_MIN_ADMIN = 12;
export const EMAIL_MAX = 254;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @param {unknown} value */
export function isEmail(value) {
  return typeof value === 'string' && EMAIL.test(value.trim());
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
 * "@" and the name.
 * @param {string} password
 * @param {{ role?: string | null, email?: string | null, name?: string | null, characterClasses?: boolean }} [context]
 * @returns {PasswordRequirement[]}
 */
export function passwordProblems(password, context = {}) {
  const { role, email, name, characterClasses = false } = context;
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

/** Email: trimmed, at most 254 characters, a valid format, lower cased on submit. */
export const emailSchema = z
  .string()
  .trim()
  .min(1, M.emailRequired)
  .max(EMAIL_MAX, M.emailLong)
  .refine((v) => EMAIL.test(v), M.emailInvalid)
  .transform((v) => v.toLowerCase());
const requiredEmail = emailSchema;

const code = z
  .string()
  .trim()
  .min(1, M.codeRequired)
  .refine((v) => isPlausibleCode(v), M.codeInvalid);

/** The code screens (sign in code, confirm email). */
export const codeSchema = z.object({ code });

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
  email: emailSchema,
  password: z.string().min(1, M.passwordRequired),
});

export const registerSchema = z
  .object({
    role: z.string().refine((v) => v === 'farmer' || v === 'buyer', M.roleRequired),
    name: z.string().trim().min(1, M.nameRequired).min(2, M.nameShort).max(100, M.nameLong),
    email: emailSchema,
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

/**
 * The administrator invitation form (F4): name and email, validated like registration; the
 * code is sent to the email.
 */
export const inviteSchema = z.object({
  name: z.string().trim().min(1, M.nameRequired).min(2, M.nameShort).max(100, M.nameLong),
  email: requiredEmail,
});

/**
 * Set a first password on an account created with Google (/account/password): the emailed
 * code and the new password. The email comes from GET /auth/me, never from a field.
 * @param {string | null | undefined} email  for the "not your email" rule
 */
export function setPasswordSchema(email) {
  return z.object({ code, password: z.string(), confirmPassword: z.string() }).superRefine(
    refinePassword({
      passwordKey: 'password',
      confirmKey: 'confirmPassword',
      contextOf: () => ({ role: null, email: email ?? null }),
    }),
  );
}
