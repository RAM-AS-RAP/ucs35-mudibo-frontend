import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError } from '@/api/errors';
import { ApiStatus } from '@/components/feedback/ApiStatus';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormField } from '@/components/auth/FormField';
import { PasswordField } from '@/components/auth/PasswordField';
import { FormErrorSummary } from '@/components/auth/FormErrorSummary';
import { SubmitButton } from '@/components/auth/CountdownButton';
import { InfoMessage, OfflineFormNotice } from '@/components/auth/FormNotices';
import { useServerProblem } from '@/components/auth/useServerProblem';
import { useSignInHold } from '@/auth/auth';
import { useAuth } from '@/auth/useAuth';
import { getPostLoginPath } from '@/auth/redirects';
import { consumeFlash, peekFlash } from '@/auth/session';
import { useIsOffline } from '@/lib/connectivity';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import { loginSchema } from '@/lib/validation';

const T = MESSAGES.login;
const linkClass = 'flex min-h-11 items-center text-primary underline underline-offset-2';

/** Sign in with a phone number or email and a password (POST /auth/login, then GET /auth/me). */
export default function LoginScreen() {
  const headingRef = usePageTitle(T.title);
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const offline = useIsOffline();
  const holdRedirect = useSignInHold();

  // The one time message (session expired, password changed, account created...), read once.
  // Without one, a visitor sent here by the guard is told why. A sign out leaves an empty
  // flash, so nothing is shown right after it.
  const [flash] = useState(() => {
    const message = peekFlash();
    if (message !== null) return message || null;
    const sentByGuard =
      location.state && typeof location.state === 'object' && 'from' in location.state;
    return sentByGuard ? MESSAGES.flash.unauthorized : null;
  });
  useEffect(() => {
    consumeFlash();
  }, []);

  const {
    register,
    handleSubmit,
    setError,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });
  const { problem, summaryRef, showError, clearProblem, countdown } = useServerProblem({
    setError,
    idPrefix: 'login',
    fieldMap: { identifier: 'identifier', password: 'password' },
    passwordField: 'password',
  });

  /** @param {{ identifier: string, password: string }} values */
  async function onSubmit({ identifier, password }) {
    clearProblem();
    // PublicOnly waits until this screen has navigated away (the hold ends when it unmounts).
    const release = holdRedirect();
    try {
      const session = await login(identifier.trim(), password);
      const next = getPostLoginPath(session, location.state);
      if (next === location.pathname) release();
      else await navigate(next, { replace: true });
    } catch (error) {
      release();
      if (error instanceof ApiError && error.status === 401) {
        // Same message for an unknown account, a wrong password and a disabled account.
        resetField('password');
        showError(error, { text: T.invalid });
      } else {
        showError(error);
      }
    }
  }

  return (
    <AuthLayout title={T.title} subtitle={T.subtitle} headingRef={headingRef} after={<ApiStatus />}>
      {flash && <InfoMessage>{flash}</InfoMessage>}
      <FormErrorSummary
        ref={summaryRef}
        problems={problem?.problems ?? []}
        reference={problem?.reference}
      />
      <OfflineFormNotice offline={offline} />
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          id="login-identifier"
          label={T.identifierLabel}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          error={errors.identifier?.message}
          {...register('identifier')}
        />
        <PasswordField
          id="login-password"
          label={T.passwordLabel}
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <SubmitButton
          pending={isSubmitting}
          pendingLabel={T.pending}
          remaining={countdown.remaining}
          disabled={offline}
        >
          {T.submit}
        </SubmitButton>
      </form>
      <nav aria-label="Account pages" className="flex flex-col">
        <Link className={linkClass} to="/register">
          {T.createAccount}
        </Link>
        <Link className={linkClass} to="/forgot-password">
          {T.forgotPassword}
        </Link>
      </nav>
    </AuthLayout>
  );
}
