import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { requestPasswordReset } from '@/api/endpoints';
import { Button } from '@/components/ui/button';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormField } from '@/components/auth/FormField';
import { FormErrorSummary } from '@/components/auth/FormErrorSummary';
import { SubmitButton } from '@/components/auth/CountdownButton';
import { OfflineFormNotice, SuccessMessage } from '@/components/auth/FormNotices';
import { useServerProblem } from '@/components/auth/useServerProblem';
import { useIsOffline } from '@/lib/connectivity';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import { forgotPasswordSchema } from '@/lib/validation';

const T = MESSAGES.forgot;
const linkClass = 'flex min-h-11 items-center text-primary underline underline-offset-2';

/**
 * Request a password reset code (POST /auth/password-reset/request). The answer is the same
 * whether or not an account exists, so the screen always shows the same confirmation.
 */
export default function ForgotPasswordScreen() {
  const headingRef = usePageTitle(T.title);
  const navigate = useNavigate();
  const offline = useIsOffline();
  const [sentTo, setSentTo] = useState(/** @type {string | null} */ (null));

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });
  const { problem, summaryRef, showError, clearProblem, countdown } = useServerProblem({
    setError,
    idPrefix: 'forgot',
    fieldMap: { email: 'email' },
  });

  /** @param {{ email: string }} values */
  async function onSubmit({ email }) {
    clearProblem();
    setSentTo(null);
    try {
      await requestPasswordReset({ email });
      setSentTo(email);
    } catch (error) {
      showError(error);
    }
  }

  return (
    <AuthLayout title={T.title} subtitle={T.subtitle} headingRef={headingRef}>
      <FormErrorSummary
        ref={summaryRef}
        problems={problem?.problems ?? []}
        reference={problem?.reference}
      />
      {sentTo && (
        <div className="flex flex-col gap-3">
          <SuccessMessage title="Check your email">{T.sent}</SuccessMessage>
          <Button
            type="button"
            // The email travels in router state only, never in the URL.
            onClick={() => navigate('/reset-password', { state: { email: sentTo } })}
          >
            {T.continue}
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      )}
      <OfflineFormNotice offline={offline} />
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          id="forgot-email"
          label={T.emailLabel}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          hint={T.help}
          error={errors.email?.message}
          {...register('email')}
        />
        <SubmitButton
          pending={isSubmitting}
          pendingLabel={T.pending}
          remaining={countdown.remaining}
          disabled={offline}
          variant={sentTo ? 'outline' : 'default'}
        >
          {T.submit}
        </SubmitButton>
      </form>
      <Link className={linkClass} to="/login">
        {T.backToLogin}
      </Link>
    </AuthLayout>
  );
}
