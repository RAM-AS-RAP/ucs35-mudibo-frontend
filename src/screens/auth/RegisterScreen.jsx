import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShoppingBasket, Sprout } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FieldError, FormField, errorId } from '@/components/auth/FormField';
import { PasswordField } from '@/components/auth/PasswordField';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
import { FormErrorSummary } from '@/components/auth/FormErrorSummary';
import { SubmitButton } from '@/components/auth/CountdownButton';
import { InfoMessage, OfflineFormNotice } from '@/components/auth/FormNotices';
import { GoogleSignInSlot } from '@/components/auth/GoogleSignInSlot';
import { useServerProblem } from '@/components/auth/useServerProblem';
import { startRegistration } from '@/auth/auth';
import { consumeFlash, peekFlash } from '@/auth/session';
import { useIsOffline } from '@/lib/connectivity';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import { cn } from '@/lib/utils';
import { registerSchema } from '@/lib/validation';

const T = MESSAGES.register;
const ROLE_OPTIONS = [
  { value: 'farmer', label: T.farmer, hint: T.farmerHint, icon: Sprout },
  { value: 'buyer', label: T.buyer, hint: T.buyerHint, icon: ShoppingBasket },
];
const SERVER_FIELDS = { name: 'name', email: 'email', password: 'password' };
export const REGISTER_VERIFY_PATH = '/register/verify';
const linkClass = 'inline-flex min-h-11 items-center text-primary underline underline-offset-2';

/** While Google sign in runs, the screen's own controls are greyed out and cannot be used. */
const BUSY_CLASS =
  'pointer-events-none opacity-50 transition-opacity motion-reduce:transition-none';

/** @param {string | null} value */
const roleFromQuery = (value) => (value === 'farmer' || value === 'buyer' ? value : '');

/**
 * Farmer or buyer registration. The choice is explicit (no default), and the role is never
 * sent in the body: it picks the endpoint (POST /auth/register/farmer or /buyer). The body is
 * exactly {name, email, password}. The answer is always 202 with the same shape (also for an
 * address that already has an account), so the next screen never says whether one exists.
 */
export default function RegisterScreen() {
  const headingRef = usePageTitle(T.title);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const offline = useIsOffline();
  const [googleBusy, setGoogleBusy] = useState(false);
  const busy = useRef(false);
  // A flash from the verify step (registration_lost), shown once.
  const [flash] = useState(() => peekFlash() || null);
  useEffect(() => {
    consumeFlash();
  }, []);

  const {
    register,
    handleSubmit,
    setError,
    control,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: roleFromQuery(searchParams.get('role')),
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });
  const { problem, summaryRef, showError, clearProblem, countdown } = useServerProblem({
    setError,
    idPrefix: 'register',
    fieldMap: SERVER_FIELDS,
    passwordField: 'password',
  });
  const [role, name, email, password] = useWatch({
    control,
    name: ['role', 'name', 'email', 'password'],
  });

  /** @param {import('zod').infer<typeof registerSchema>} values */
  async function onSubmit(values) {
    if (busy.current) return;
    busy.current = true;
    clearProblem();
    // The password is not kept in the form after the request (cleared before a server error
    // is shown, so a password_too_weak reason stays on the field).
    const clearPasswords = () => {
      resetField('password');
      resetField('confirmPassword');
    };
    try {
      await startRegistration(values.role === 'farmer' ? 'farmer' : 'buyer', {
        name: values.name,
        email: values.email,
        password: values.password,
      });
    } catch (error) {
      clearPasswords();
      showError(error);
      return;
    } finally {
      busy.current = false;
    }
    clearPasswords();
    await navigate(REGISTER_VERIFY_PATH);
  }

  const roleError = errors.role?.message;

  return (
    <AuthLayout title={T.title} headingRef={headingRef}>
      {flash && <InfoMessage>{flash}</InfoMessage>}
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
        className={cn('flex flex-col gap-4 lg:gap-3.5', googleBusy && BUSY_CLASS)}
      >
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={roleError ? errorId('register-role') : undefined}
        >
          <legend className="mb-2 text-sm font-medium text-text">{T.roleLegend}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const checked = role === option.value;
              return (
                <label
                  key={option.value}
                  htmlFor={`register-role-${option.value}`}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
                    checked ? 'border-primary bg-canvas' : 'border-border bg-card',
                  )}
                >
                  <input
                    id={`register-role-${option.value}`}
                    type="radio"
                    value={option.value}
                    className="mt-1 size-5 shrink-0 accent-primary"
                    {...register('role')}
                  />
                  <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span className="flex flex-col">
                    <span className="font-medium text-text">{option.label}</span>
                    <span className="text-sm text-text-secondary">{option.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <FieldError id="register-role" message={roleError} />
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
          <FormField
            id="register-name"
            label={T.nameLabel}
            type="text"
            autoComplete="name"
            error={errors.name?.message}
            {...register('name')}
          />
          <FormField
            id="register-email"
            label={T.emailLabel}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            error={errors.email?.message}
            {...register('email')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
          <PasswordField
            id="register-password"
            label={T.passwordLabel}
            autoComplete="new-password"
            error={errors.password?.message}
            describedByIds={['register-password-requirements']}
            {...register('password')}
          />
          <PasswordField
            id="register-confirmPassword"
            label={T.confirmLabel}
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
        </div>
        <PasswordRequirements
          id="register-password-requirements"
          password={password}
          context={{ role, name, email, characterClasses: true }}
          columns
          hideUntilTyped
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
      <GoogleSignInSlot
        context="register"
        preferredRole={role === 'farmer' || role === 'buyer' ? role : null}
        onBusyChange={setGoogleBusy}
      />
      <p
        inert={googleBusy}
        className={cn(
          'flex flex-wrap items-center gap-x-2 text-text-secondary',
          googleBusy && BUSY_CLASS,
        )}
      >
        <span>{T.haveAccount}</span>
        <Link className={linkClass} to="/login">
          {T.signIn}
        </Link>
      </p>
    </AuthLayout>
  );
}
