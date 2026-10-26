import { useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { requestInviteCode } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormField } from '@/components/auth/FormField';
import { CodeInput } from '@/components/auth/CodeInput';
import { PasswordField } from '@/components/auth/PasswordField';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
import { FormErrorSummary } from '@/components/auth/FormErrorSummary';
import { SubmitButton } from '@/components/auth/CountdownButton';
import { OfflineFormNotice } from '@/components/auth/FormNotices';
import { ResendCode } from '@/components/auth/ResendCode';
import { SignedInNotice } from '@/components/auth/SignedInNotice';
import { useServerProblem } from '@/components/auth/useServerProblem';
import { acceptInvitation, usePublicRedirectHeld, useSignInHold } from '@/auth/auth';
import { getPostLoginPath } from '@/auth/redirects';
import { useSession } from '@/auth/session';
import { useIsOffline } from '@/lib/connectivity';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import { acceptInviteSchema } from '@/lib/validation';

const T = MESSAGES.invite;
const SERVER_FIELDS = { email: 'email', code: 'code', password: 'password' };
const linkClass = 'flex min-h-11 items-center text-primary underline underline-offset-2';

/** The invitation form (POST /auth/accept-invite), shown only without a session. */
function AcceptInviteForm() {
  const navigate = useNavigate();
  const offline = useIsOffline();
  const holdRedirect = useSignInHold();
  const busy = useRef(false);

  const {
    register,
    handleSubmit,
    setError,
    control,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { email: '', code: '', password: '', confirmPassword: '' },
  });
  const { problem, summaryRef, showError, clearProblem, countdown } = useServerProblem({
    setError,
    idPrefix: 'invite',
    fieldMap: SERVER_FIELDS,
    passwordField: 'password',
  });
  const [email, password] = useWatch({ control, name: ['email', 'password'] });

  /** @param {import('zod').infer<typeof acceptInviteSchema>} values */
  async function onSubmit(values) {
    if (busy.current) return;
    busy.current = true;
    clearProblem();
    // The new admin is signed in with the returned AuthResult; `login` is never called (it would
    // ask for a second code). The hold keeps PublicOnly and SignedInNotice back until we navigate.
    const release = holdRedirect();
    try {
      const result = await acceptInvitation({
        email: values.email,
        code: values.code,
        password: values.password,
      });
      if (result.status === 'code_required') await navigate('/login/code', { replace: true });
      else await navigate(getPostLoginPath(result.session, null), { replace: true });
    } catch (error) {
      release();
      if (error instanceof ApiError && error.code === 'invalid_or_expired_code') {
        showError(error, { text: T.invalidCode, fieldId: 'invite-code' });
      } else {
        showError(error);
      }
    } finally {
      busy.current = false;
    }
  }

  async function getEmailForResend() {
    return (await trigger('email')) ? getValues('email') : null;
  }

  return (
    <>
      <FormErrorSummary
        ref={summaryRef}
        problems={problem?.problems ?? []}
        reference={problem?.reference}
      >
        {problem?.code === 'invalid_or_expired_code' && (
          <>
            <p className="text-sm text-text">{T.lockout}</p>
            <ResendCode
              label={T.resend}
              sentText={T.resendSent}
              request={(value) => requestInviteCode({ email: value })}
              getEmail={getEmailForResend}
            />
          </>
        )}
      </FormErrorSummary>
      <OfflineFormNotice offline={offline} />
      <form
        noValidate
        onSubmit={(event) => handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-4"
      >
        <FormField
          id="invite-email"
          label={T.emailLabel}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          error={errors.email?.message}
          {...register('email')}
        />
        <CodeInput
          id="invite-code"
          label={T.codeLabel}
          hint={T.codeHint}
          error={errors.code?.message}
          {...register('code')}
        />
        <PasswordField
          id="invite-password"
          label={T.passwordLabel}
          autoComplete="new-password"
          hint={T.passwordHint}
          error={errors.password?.message}
          describedByIds={['invite-password-requirements']}
          {...register('password')}
        >
          <PasswordRequirements
            id="invite-password-requirements"
            password={password}
            context={{ role: 'admin', email }}
          />
        </PasswordField>
        <PasswordField
          id="invite-confirmPassword"
          label={T.confirmLabel}
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <SubmitButton
          pending={isSubmitting}
          pendingLabel={T.pending}
          remaining={countdown.remaining}
          disabled={offline || countdown.longWait}
        >
          {T.submit}
        </SubmitButton>
      </form>
    </>
  );
}

/** Accept an administrator invitation. Reachable with or without a session. */
export default function AcceptInviteScreen() {
  const headingRef = usePageTitle(T.title);
  const session = useSession();
  // While the new account signs in, keep the form mounted until it navigates away.
  const held = usePublicRedirectHeld();
  return (
    <AuthLayout title={T.title} subtitle={T.subtitle} headingRef={headingRef}>
      {session && !held ? <SignedInNotice /> : <AcceptInviteForm />}
      <Link className={linkClass} to="/login">
        {T.backToLogin}
      </Link>
    </AuthLayout>
  );
}
