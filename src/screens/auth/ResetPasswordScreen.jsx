import { Link, useLocation, useNavigate } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { confirmPasswordReset, requestPasswordReset } from '@/api/endpoints';
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
import { setFlash, useSession } from '@/auth/session';
import { useIsOffline } from '@/lib/connectivity';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import { resetPasswordSchema } from '@/lib/validation';

const T = MESSAGES.reset;
const SERVER_FIELDS = { email: 'email', code: 'code', new_password: 'password' };
const linkClass = 'flex min-h-11 items-center text-primary underline underline-offset-2';

/** @param {unknown} state */
const emailFromState = (state) =>
  state && typeof state === 'object' && 'email' in state && typeof state.email === 'string'
    ? state.email
    : '';

/** The reset form (POST /auth/password-reset/confirm), shown only without a session. */
function ResetPasswordForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const offline = useIsOffline();

  const {
    register,
    handleSubmit,
    setError,
    control,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: emailFromState(location.state),
      code: '',
      password: '',
      confirmPassword: '',
    },
  });
  const { problem, summaryRef, showError, clearProblem, countdown } = useServerProblem({
    setError,
    idPrefix: 'reset',
    fieldMap: SERVER_FIELDS,
    passwordField: 'password',
  });
  const [email, password] = useWatch({ control, name: ['email', 'password'] });

  /** @param {import('zod').infer<typeof resetPasswordSchema>} values */
  async function onSubmit(values) {
    clearProblem();
    try {
      await confirmPasswordReset({
        email: values.email,
        code: values.code,
        newPassword: values.password,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'invalid_or_expired_code') {
        showError(error, { text: T.invalidCode, fieldId: 'reset-code' });
      } else {
        showError(error);
      }
      return;
    }
    setFlash(MESSAGES.flash.passwordUpdated);
    navigate('/login', { replace: true });
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
          <ResendCode
            label={T.resend}
            sentText={T.resendSent}
            request={(value) => requestPasswordReset({ email: value })}
            getEmail={getEmailForResend}
          />
        )}
      </FormErrorSummary>
      <OfflineFormNotice offline={offline} />
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          id="reset-email"
          label={T.emailLabel}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          error={errors.email?.message}
          {...register('email')}
        />
        <CodeInput
          id="reset-code"
          label={T.codeLabel}
          hint={T.codeHint}
          error={errors.code?.message}
          {...register('code')}
        />
        <PasswordField
          id="reset-password"
          label={T.passwordLabel}
          autoComplete="new-password"
          error={errors.password?.message}
          describedByIds={['reset-password-requirements']}
          {...register('password')}
        >
          <PasswordRequirements
            id="reset-password-requirements"
            password={password}
            context={{ role: null, email }}
          />
        </PasswordField>
        <PasswordField
          id="reset-confirmPassword"
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

/** Reset a forgotten password with the emailed code. Reachable with or without a session. */
export default function ResetPasswordScreen() {
  const headingRef = usePageTitle(T.title);
  const session = useSession();
  return (
    <AuthLayout title={T.title} subtitle={T.subtitle} headingRef={headingRef}>
      {session ? <SignedInNotice /> : <ResetPasswordForm />}
      <Link className={linkClass} to="/login">
        {T.backToLogin}
      </Link>
    </AuthLayout>
  );
}
