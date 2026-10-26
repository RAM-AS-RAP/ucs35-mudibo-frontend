import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError, getUserMessage } from '@/api/errors';
import { useIsOffline } from '@/lib/connectivity';
import { MESSAGES } from '@/lib/messages';
import { codeSchema } from '@/lib/validation';
import { CodeInput } from './CodeInput';
import { FormErrorSummary } from './FormErrorSummary';
import { SubmitButton } from './CountdownButton';
import { InfoMessage, OfflineFormNotice } from './FormNotices';
import { ResendCodeButton } from './ResendCodeButton';
import { useServerProblem } from './useServerProblem';

const T = MESSAGES.code;
const linkClass = 'flex min-h-11 items-center text-primary underline underline-offset-2';

/**
 * The shared body of the two code screens (sign in code, confirm email): the code field, a
 * submit button with a spinner, the error summary, "Send a new code", "Start again" and a
 * status region for resend results.
 *
 * It never submits by itself: a pasted code must still be confirmed with the button, so no
 * attempt is used by accident. After a wrong code the field is cleared and focused again.
 * The code exists only in this form's state and in the request body.
 *
 * @param {{
 *   idPrefix: string,
 *   notice?: import('react').ReactNode,
 *   help?: import('react').ReactNode,
 *   submitLabel: string,
 *   invalidCodeText: string,
 *   verify: (code: string) => Promise<void>,
 *   resend: () => Promise<string>,
 *   onFlowError?: (error: unknown) => boolean,
 *   startAgainTo: string,
 *   onStartAgain: () => void,
 * }} props
 *   verify: completes the flow (the screen navigates) or throws an ApiError;
 *   resend: sends a new code and returns the text to announce;
 *   onFlowError: screen specific handling (challenge_closed), true when handled.
 */
export function CodeEntryForm({
  idPrefix,
  notice,
  help,
  submitLabel,
  invalidCodeText,
  verify,
  resend,
  onFlowError = () => false,
  startAgainTo,
  onStartAgain,
}) {
  const offline = useIsOffline();
  const busy = useRef(false);
  const resendBusy = useRef(false);
  const [resendPending, setResendPending] = useState(false);
  const [resendHidden, setResendHidden] = useState(false);
  const [status, setStatus] = useState(/** @type {{ id: number, text: string } | null} */ (null));
  const fieldId = `${idPrefix}-code`;

  const {
    register,
    handleSubmit,
    setError,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });
  const { problem, summaryRef, showError, clearProblem, countdown } = useServerProblem({
    setError,
    idPrefix,
    fieldMap: { code: 'code' },
  });

  /** @param {string} text */
  const announce = (text) => setStatus((previous) => ({ id: (previous?.id ?? 0) + 1, text }));

  /** @param {{ code: string }} values */
  async function onSubmit({ code }) {
    if (busy.current) return;
    busy.current = true;
    clearProblem();
    setStatus(null);
    try {
      await verify(code);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'invalid_or_expired_code') {
        // A field message, the field cleared and focused again for the next try.
        resetField('code');
        setError('code', { type: 'server', message: invalidCodeText }, { shouldFocus: true });
      } else if (!onFlowError(error)) {
        showError(error);
      }
    } finally {
      busy.current = false;
    }
  }

  async function onResend() {
    if (resendBusy.current) return;
    resendBusy.current = true;
    setResendPending(true);
    clearProblem();
    try {
      announce(await resend());
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        // The countdown was restarted from Retry-After by the flow store.
        announce(getUserMessage(error));
      } else if (error instanceof ApiError && error.code === 'send_limit_reached') {
        setResendHidden(true);
        showError(error);
      } else if (!onFlowError(error)) {
        showError(error);
      }
    } finally {
      resendBusy.current = false;
      setResendPending(false);
    }
  }

  return (
    <>
      {notice}
      {status && <InfoMessage key={status.id}>{status.text}</InfoMessage>}
      <FormErrorSummary
        ref={summaryRef}
        problems={problem?.problems ?? []}
        reference={problem?.reference}
      />
      <OfflineFormNotice offline={offline} />
      <form
        noValidate
        data-auth-code-step=""
        onSubmit={(event) => handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-4"
      >
        <CodeInput
          id={fieldId}
          label={T.label}
          hint={T.hint}
          error={errors.code?.message}
          {...register('code')}
        />
        <SubmitButton
          pending={isSubmitting}
          pendingLabel={T.pending}
          remaining={countdown.remaining}
          disabled={offline || countdown.longWait}
        >
          {submitLabel}
        </SubmitButton>
      </form>
      {!resendHidden && (
        <ResendCodeButton onClick={onResend} pending={resendPending} disabled={offline} />
      )}
      <nav aria-label={T.otherActions} className="flex flex-col">
        <Link className={linkClass} to={startAgainTo} onClick={onStartAgain}>
          {T.startAgain}
        </Link>
      </nav>
      {help && <div className="flex flex-col gap-1 text-sm text-text-secondary">{help}</div>}
    </>
  );
}
