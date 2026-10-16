import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, getUserMessage } from '@/api/errors';
import { serverFieldErrors } from '@/lib/formErrors';
import { MESSAGES } from '@/lib/messages';
import { useCountdown } from '@/lib/useCountdown';

export const DEFAULT_RETRY_SECONDS = 60;

/**
 * @typedef {object} ServerProblem
 * @property {import('./FormErrorSummary').FormProblem[]} problems
 * @property {string | null} reference
 * @property {string} code
 */

/**
 * State for a form's server errors: the problem list for FormErrorSummary (focused whenever a
 * new problem is set), 422 field errors pushed into React Hook Form, and the 429 countdown.
 * @param {{
 *   setError: import('react-hook-form').UseFormSetError<any>,
 *   fieldMap?: Record<string, string>,
 *   passwordField?: string,
 *   idPrefix: string,
 * }} options  fieldMap: server field -> form field; ids of inputs are `${idPrefix}-${field}`
 */
export function useServerProblem({ setError, fieldMap = {}, passwordField, idPrefix }) {
  const [problem, setProblem] = useState(/** @type {ServerProblem | null} */ (null));
  const summaryRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const countdown = useCountdown();
  const startCountdown = countdown.start;

  // A layout effect: focus moves right after the summary is committed, before paint, and does
  // not wait for the scheduler (which fake timers can hold back in tests).
  useLayoutEffect(() => {
    if (problem) summaryRef.current?.focus();
  }, [problem]);

  const clearProblem = useCallback(() => setProblem(null), []);

  /**
   * Show a server error. Returns its code so the screen can add specific handling.
   * @param {unknown} error
   * @param {{ messages?: Record<string, string>, text?: string, fieldId?: string }} [options]
   *   messages: per code overrides; text: replaces the message; fieldId: links it to a field
   */
  const showError = useCallback(
    (error, { messages = {}, text, fieldId } = {}) => {
      const code = error instanceof ApiError ? error.code : 'unknown';
      const reference = error instanceof ApiError ? error.requestId : null;
      /** @type {import('./FormErrorSummary').FormProblem[]} */
      const problems = [];

      if (text) {
        problems.push(fieldId ? { text, fieldId } : { text });
      } else if (error instanceof ApiError && error.status === 429) {
        const seconds =
          error.retryAfter && error.retryAfter > 0 ? error.retryAfter : DEFAULT_RETRY_SECONDS;
        startCountdown(seconds);
        problems.push({ text: MESSAGES.form.tooManyAttempts(seconds) });
      } else if (error instanceof ApiError && error.status === 422) {
        const { fields, unmapped } = serverFieldErrors(error, { fieldMap, passwordField });
        for (const [field, message] of Object.entries(fields)) {
          setError(field, { type: 'server', message });
          problems.push({ text: message, fieldId: `${idPrefix}-${field}` });
        }
        for (const text of unmapped) problems.push({ text });
        if (!problems.length) problems.push({ text: messages[code] ?? getUserMessage(error) });
      } else {
        problems.push({ text: messages[code] ?? getUserMessage(error) });
      }
      setProblem({ problems, reference, code });
      return code;
    },
    [startCountdown, fieldMap, passwordField, idPrefix, setError],
  );

  return { problem, summaryRef, showError, clearProblem, countdown };
}
