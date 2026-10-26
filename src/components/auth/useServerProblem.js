import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, getUserMessage } from '@/api/errors';
import { serverFieldErrors } from '@/lib/formErrors';
import { MESSAGES } from '@/lib/messages';
import { useRetryWait } from '@/lib/useRetryWait';
import { DEFAULT_WAIT_SECONDS, waitSecondsFrom } from '@/lib/waitTime';

export const DEFAULT_RETRY_SECONDS = DEFAULT_WAIT_SECONDS;

/**
 * The request id only helps support with failures on the server's side. A 4xx (wrong password,
 * expired code, validation) is the user's to fix, so it gets the message alone.
 * @param {unknown} error
 * @returns {string | null}
 */
function supportReference(error) {
  return error instanceof ApiError && error.status >= 500 ? error.requestId : null;
}

/**
 * @typedef {object} ServerProblem
 * @property {import('./FormErrorSummary').FormProblem[]} problems
 * @property {string | null} reference
 * @property {string} code
 */

/**
 * State for a form's server errors: the problem list for FormErrorSummary (focused whenever a
 * new problem is set), 422 field errors pushed into React Hook Form, and the wait after a 429:
 * up to 120 seconds count down on the button (`countdown.remaining`); a longer wait is shown
 * approximately and keeps the button disabled until a stored end time (`countdown.longWait`).
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
  const countdown = useRetryWait();
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
      const reference = supportReference(error);
      /** @type {import('./FormErrorSummary').FormProblem[]} */
      const problems = [];

      if (text) {
        problems.push(fieldId ? { text, fieldId } : { text });
      } else if (error instanceof ApiError && error.status === 429) {
        const seconds = waitSecondsFrom(error.retryAfter);
        startCountdown(seconds);
        const own = code === 'too_many_login_codes' ? getUserMessage(error) : null;
        problems.push({ text: messages[code] ?? own ?? MESSAGES.form.tooManyAttempts(seconds) });
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
