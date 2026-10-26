/**
 * Turn a server error into form field errors.
 *
 * 422 validation_error bodies carry `fields` (dotted names without the "body" prefix, for
 * example "new_password") and `details` ([{ field, message }]). A model level problem (for
 * example a new password equal to the current one) is reported on the field "request".
 * 422 password_too_weak has no field: its `reason` belongs on the password field.
 */
import { ApiError, getUserMessage } from '@/api/errors';

/** "Value error, Password must contain a digit" -> "Password must contain a digit." */
function tidy(/** @type {string} */ message) {
  const text = message.replace(/^Value error,\s*/i, '').trim();
  if (!text) return text;
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * @param {unknown} error
 * @param {{ fieldMap: Record<string, string>, passwordField?: string }} options
 *   fieldMap: server field name -> form field name; passwordField: where password_too_weak goes
 * @returns {{ fields: Record<string, string>, unmapped: string[] }}
 */
export function serverFieldErrors(error, { fieldMap, passwordField }) {
  /** @type {Record<string, string>} */
  const fields = {};
  /** @type {string[]} */
  const unmapped = [];
  if (!(error instanceof ApiError) || error.status !== 422) return { fields, unmapped };

  if (error.code === 'password_too_weak') {
    const message = error.reason ? tidy(error.reason) : getUserMessage(error);
    if (passwordField) fields[passwordField] = message;
    else unmapped.push(message);
    return { fields, unmapped };
  }

  if (error.code !== 'validation_error') return { fields, unmapped };
  const details = Array.isArray(error.details) ? error.details : [];
  const seen = new Set();
  for (const detail of details) {
    const serverField = typeof detail?.field === 'string' ? detail.field : '';
    const message = typeof detail?.message === 'string' ? tidy(detail.message) : '';
    const target = fieldMap[serverField] ?? fieldMap[serverField.split('.').pop() ?? ''];
    seen.add(serverField);
    if (target && message && !fields[target]) fields[target] = message;
    else if (message) unmapped.push(message);
  }
  // Fields named without a detail message.
  for (const serverField of error.fields ?? []) {
    if (seen.has(serverField)) continue;
    const target = fieldMap[serverField];
    if (target && !fields[target]) fields[target] = getUserMessage(error);
  }
  return { fields, unmapped };
}
