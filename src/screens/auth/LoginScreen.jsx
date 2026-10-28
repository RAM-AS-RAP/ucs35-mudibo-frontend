import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Mail } from 'lucide-react';
import { ApiError } from '@/api/errors';
import { ApiStatus } from '@/components/feedback/ApiStatus';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormField } from '@/components/auth/FormField';
import { PasswordField } from '@/components/auth/PasswordField';
import { FormErrorSummary } from '@/components/auth/FormErrorSummary';
import { SubmitButton } from '@/components/auth/CountdownButton';
import { InfoMessage, OfflineFormNotice } from '@/components/auth/FormNotices';
import { GoogleSignInSlot } from '@/components/auth/GoogleSignInSlot';
import { useServerProblem } from '@/components/auth/useServerProblem';
import { useSignInHold } from '@/auth/auth';
import { hasActiveFlow, useFlowView } from '@/auth/flow';
import { useAuth } from '@/auth/useAuth';
import { fromState, getPostLoginPath } from '@/auth/redirects';
import { consumeFlash, peekFlash } from '@/auth/session';
import { useIsOffline } from '@/lib/connectivity';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import { cn } from '@/lib/utils';
import { loginSchema } from '@/lib/validation';

const T = MESSAGES.login;
const linkClass = 'flex min-h-11 items-center text-primary underline underline-offset-2';
export const LOGIN_CODE_PATH = '/login/code';

/** While Google sign in runs, the screen's own controls are greyed out and cannot be used. */
const BUSY_CLASS =
  'pointer-events-none opacity-50 transition-opacity motion-reduce:transition-none';

/**
 * Sign in with an email and a password (POST /auth/login). The answer is an AuthResult:
 * `signed_in` opens the intended path, `code_required` opens /login/code (the challenge token
 * stays in the in memory flow store; router state carries only `{from}`).
 */
export default function LoginScreen() {
  const headingRef = usePageTitle(T.title);
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const offline = useIsOffline();
  const holdRedirect = useSignInHold();
  const busy = useRef(false);
  const flow = useFlowView('login');
  const [flowActive] = useState(() => hasActiveFlow('login'));
  const [googleBusy, setGoogleBusy] = useState(false);

  // The one time message (session expired, password changed, sign in interrupted...), read
  // once. Without one, a visitor sent here by the guard is told why. A sign out leaves an
  // empty flash, so nothing is shown right after it.
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
    defaultValues: { email: '', password: '' },
  });
  const { problem, summaryRef, showError, clearProblem, countdown } = useServerProblem({
    setError,
    idPrefix: 'login',
    fieldMap: { email: 'email', password: 'password' },
    passwordField: 'password',
  });

  /** @param {{ email: string, password: string }} values */
  async function onSubmit({ email, password }) {
    if (busy.current) return;
    busy.current = true;
    clearProblem();
    // PublicOnly waits until this screen has navigated away (the hold ends when it unmounts).
    const release = holdRedirect();
    try {
      const result = await login(email, password);
      // The password is not kept after the request.
      resetField('password');
      if (result.status === 'code_required') {
        await navigate(LOGIN_CODE_PATH, { state: fromState(location.state) });
        return;
      }
      const next = getPostLoginPath(result.session, location.state);
      if (next === location.pathname) release();
      else await navigate(next, { replace: true });
    } catch (error) {
      release();
      resetField('password');
      if (error instanceof ApiError && error.status === 401) {
        // Same message for an unknown email, a wrong password and a disabled account.
        showError(error, { text: T.invalid });
      } else {
        showError(error);
      }
    } finally {
      busy.current = false;
    }
  }

  return (
    <AuthLayout title={T.title} subtitle={T.subtitle} headingRef={headingRef} after={<ApiStatus />}>
      {flash && <InfoMessage>{flash}</InfoMessage>}
      {flow && flowActive && (
        <div
          inert={googleBusy}
          className={cn(
            'flex flex-col gap-2 rounded-lg border border-border bg-canvas px-4 py-3 text-text',
            googleBusy && BUSY_CLASS,
          )}
        >
          <p className="flex items-start gap-2">
            <Mail aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>{T.existingFlow(flow.emailMasked)}</span>
          </p>
          <Link
            className="flex min-h-11 items-center gap-1 font-medium text-primary underline underline-offset-2"
            to={LOGIN_CODE_PATH}
            state={fromState(location.state)}
          >
            {T.continue}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      )}
      <FormErrorSummary
        ref={summaryRef}
        problems={problem?.problems ?? []}
        reference={problem?.reference}
      />
      <OfflineFormNotice offline={offline} />
      <form
        noValidate
        inert={googleBusy}
        aria-busy={googleBusy || undefined}
        onSubmit={(event) => handleSubmit(onSubmit)(event)}
        className={cn('flex flex-col gap-4', googleBusy && BUSY_CLASS)}
      >
        <FormField
          id="login-email"
          label={T.emailLabel}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          error={errors.email?.message}
          {...register('email')}
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
          disabled={offline || countdown.longWait}
        >
          {T.submit}
        </SubmitButton>
      </form>
      <GoogleSignInSlot context="login" from={location.state} onBusyChange={setGoogleBusy} />
      <nav
        aria-label="Account pages"
        inert={googleBusy}
        className={cn('flex flex-col', googleBusy && BUSY_CLASS)}
      >
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
