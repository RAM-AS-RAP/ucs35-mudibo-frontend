import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Mail, RefreshCw } from 'lucide-react';
import { confirmPasswordReset, requestPasswordReset } from '@/api/endpoints';
import { ApiError, getUserMessage } from '@/api/errors';
import { useMe } from '@/api/queries';
import { PageHeader } from '@/components/display/PageHeader';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { CodeInput } from '@/components/auth/CodeInput';
import { CountdownButton, SubmitButton } from '@/components/auth/CountdownButton';
import { FormErrorSummary } from '@/components/auth/FormErrorSummary';
import { OfflineFormNotice, SuccessMessage } from '@/components/auth/FormNotices';
import { PasswordField } from '@/components/auth/PasswordField';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
import { RESEND_COOLDOWN_SECONDS } from '@/components/auth/ResendCode';
import { useServerProblem } from '@/components/auth/useServerProblem';
import { CHANGE_PASSWORD_PATH, LOGIN_PATH } from '@/auth/paths';
import { clear, setFlash } from '@/auth/session';
import { useIsOffline } from '@/lib/connectivity';
import { MESSAGES } from '@/lib/messages';
import { useCountdown } from '@/lib/useCountdown';
import { usePageTitle } from '@/lib/usePageTitle';
import { setPasswordSchema } from '@/lib/validation';
import { waitSecondsFrom } from '@/lib/waitTime';

const T = MESSAGES.setPassword;
const SERVER_FIELDS = { code: 'code', new_password: 'password' };
const linkClass =
  'inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2';

/**
 * "Send a new code" with the 60 second wait between sends (also after a 429).
 * @param {{ email: string, countdown: ReturnType<typeof useCountdown> }} props
 */
function ResendButton({ email, countdown }) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState(/** @type {{ ok: boolean, text: string } | null} */ (null));

  async function onClick() {
    setPending(true);
    setNote(null);
    try {
      await requestPasswordReset({ email });
      countdown.start(RESEND_COOLDOWN_SECONDS);
      setNote({ ok: true, text: T.resent });
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        const seconds = waitSecondsFrom(error.retryAfter);
        countdown.start(seconds);
        setNote({ ok: false, text: MESSAGES.form.tooManyAttempts(seconds) });
      } else {
        setNote({ ok: false, text: getUserMessage(error) });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <CountdownButton
        type="button"
        variant="outline"
        remaining={countdown.remaining}
        pending={pending}
        waitingLabel={MESSAGES.code.resendIn}
        doneAnnouncement={MESSAGES.code.resendReady}
        announceStart={false}
        onClick={onClick}
      >
        {!pending && <RefreshCw aria-hidden="true" />}
        {T.resend}
      </CountdownButton>
      {note?.ok && <SuccessMessage title="Sent">{note.text}</SuccessMessage>}
      {note && !note.ok && (
        <p role="alert" className="text-sm font-medium text-negative-text">
          {note.text}
        </p>
      )}
    </div>
  );
}

/**
 * Step 2: the emailed code and the new password (POST /auth/password-reset/confirm). The code
 * and the password exist only in the form and the request body.
 * @param {{ email: string, countdown: ReturnType<typeof useCountdown> }} props
 */
function SetPasswordForm({ email, countdown }) {
  const navigate = useNavigate();
  const offline = useIsOffline();
  const busy = useRef(false);
  const schema = useMemo(() => setPasswordSchema(email), [email]);
  const {
    register,
    handleSubmit,
    setError,
    control,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { code: '', password: '', confirmPassword: '' },
  });
  const {
    problem,
    summaryRef,
    showError,
    clearProblem,
    countdown: wait,
  } = useServerProblem({
    setError,
    idPrefix: 'set-password',
    fieldMap: SERVER_FIELDS,
    passwordField: 'password',
  });
  const password = useWatch({ control, name: 'password' });

  /** @param {{ code: string, password: string }} values */
  async function onSubmit(values) {
    if (busy.current) return;
    busy.current = true;
    clearProblem();
    try {
      await confirmPasswordReset({ email, code: values.code, newPassword: values.password });
    } catch (error) {
      resetField('confirmPassword');
      if (error instanceof ApiError && error.code === 'invalid_or_expired_code') {
        showError(error, { text: T.invalidCode, fieldId: 'set-password-code' });
      } else {
        showError(error);
      }
      return;
    } finally {
      busy.current = false;
    }
    // The backend invalidated every older token: sign in again.
    clear('password_changed');
    setFlash(`${MESSAGES.flash.passwordChanged} ${MESSAGES.flash.passwordSetAfterGoogle}`);
    navigate(LOGIN_PATH, { replace: true });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormErrorSummary
        ref={summaryRef}
        problems={problem?.problems ?? []}
        reference={problem?.reference}
      />
      <OfflineFormNotice offline={offline} />
      <form
        noValidate
        onSubmit={(event) => handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-4"
      >
        <CodeInput
          id="set-password-code"
          label={T.codeLabel}
          hint={T.codeHint}
          error={errors.code?.message}
          {...register('code')}
        />
        <PasswordField
          id="set-password-password"
          label={T.passwordLabel}
          autoComplete="new-password"
          error={errors.password?.message}
          describedByIds={['set-password-requirements']}
          {...register('password')}
        >
          <PasswordRequirements
            id="set-password-requirements"
            password={password}
            context={{ role: null, email }}
          />
        </PasswordField>
        <PasswordField
          id="set-password-confirmPassword"
          label={T.confirmLabel}
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <SubmitButton
          pending={isSubmitting}
          pendingLabel={T.pending}
          remaining={wait.remaining}
          disabled={offline || wait.longWait}
        >
          {T.submit}
        </SubmitButton>
      </form>
      <ResendButton email={email} countdown={countdown} />
    </div>
  );
}

/**
 * Step 1: email a code to the account's own address (POST /auth/password-reset/request, always
 * 202). The address comes from GET /auth/me, never from a field.
 * @param {{ email: string, onSent: () => void }} props
 */
function RequestCode({ email, onSent }) {
  const offline = useIsOffline();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const wait = useCountdown();

  async function onClick() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await requestPasswordReset({ email });
      onSent();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const seconds = waitSecondsFrom(err.retryAfter);
        wait.start(seconds);
        setError(MESSAGES.form.tooManyAttempts(seconds));
      } else {
        setError(getUserMessage(err));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 text-text">
        <Mail aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <span className="break-words">{T.intro(email)}</span>
      </p>
      <OfflineFormNotice offline={offline} />
      {error && (
        <p role="alert" className="text-sm font-medium text-negative-text">
          {error}
        </p>
      )}
      <CountdownButton
        type="button"
        remaining={wait.remaining}
        pending={pending}
        pendingLabel={T.requestPending}
        disabled={offline}
        onClick={onClick}
      >
        {T.request}
      </CountdownButton>
    </div>
  );
}

/**
 * Set a password (/account/password, farmers and buyers) on an account created with Google, so
 * email sign in works too. A two step flow on one page: email a code, then enter it with the
 * new password. Success signs the person out (older tokens are revoked).
 */
export default function SetPasswordScreen() {
  const headingRef = usePageTitle(T.title);
  const me = useMe();
  const [step, setStep] = useState(/** @type {'request' | 'confirm'} */ ('request'));
  const resend = useCountdown();

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title={T.title} headingRef={headingRef} />
      {me.isPending && <LoadingState label={T.loading} rows={2} />}
      {me.isError && (
        <ErrorState error={me.error} title={T.errorTitle} onRetry={() => void me.refetch()} />
      )}
      {me.data && me.data.password_set && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-4">
          <p className="flex items-center gap-2 font-semibold text-text">
            <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-positive" />
            {T.alreadyTitle}
          </p>
          <p className="text-text-secondary">{T.alreadyText}</p>
          <Link className={linkClass} to={CHANGE_PASSWORD_PATH}>
            {T.changeLink}
          </Link>
        </div>
      )}
      {me.data && !me.data.password_set && step === 'request' && (
        <RequestCode
          email={me.data.email}
          onSent={() => {
            resend.start(RESEND_COOLDOWN_SECONDS);
            setStep('confirm');
          }}
        />
      )}
      {me.data && !me.data.password_set && step === 'confirm' && (
        <>
          <SuccessMessage title="Sent">{T.sent(me.data.email)}</SuccessMessage>
          <SetPasswordForm email={me.data.email} countdown={resend} />
        </>
      )}
      <Link className={linkClass} to="/account/security">
        {T.back}
      </Link>
    </div>
  );
}
