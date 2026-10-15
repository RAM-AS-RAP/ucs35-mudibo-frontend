import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info, ShoppingBasket, Sprout } from 'lucide-react';
import { registerBuyer, registerFarmer } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FieldError, FormField, errorId } from '@/components/auth/FormField';
import { PasswordField } from '@/components/auth/PasswordField';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
import { FormErrorSummary } from '@/components/auth/FormErrorSummary';
import { SubmitButton } from '@/components/auth/CountdownButton';
import { OfflineFormNotice } from '@/components/auth/FormNotices';
import { useServerProblem } from '@/components/auth/useServerProblem';
import { signIn, useSignInHold } from '@/auth/auth';
import { getPostLoginPath } from '@/auth/redirects';
import { setFlash } from '@/auth/session';
import { useIsOffline } from '@/lib/connectivity';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import { cn } from '@/lib/utils';
import { normalizePhone, registerSchema } from '@/lib/validation';

const T = MESSAGES.register;
const ROLE_OPTIONS = [
  { value: 'farmer', label: T.farmer, hint: T.farmerHint, icon: Sprout },
  { value: 'buyer', label: T.buyer, hint: T.buyerHint, icon: ShoppingBasket },
];
const SERVER_FIELDS = {
  name: 'name',
  phone_number: 'phone',
  email: 'email',
  password: 'password',
};
const linkClass = 'inline-flex min-h-11 items-center text-primary underline underline-offset-2';

/** @param {string | null} value */
const roleFromQuery = (value) => (value === 'farmer' || value === 'buyer' ? value : '');

/**
 * Farmer or buyer registration. The choice is explicit (no default), and the role is never
 * sent in the body: it picks the endpoint (POST /auth/register/farmer or /buyer).
 */
export default function RegisterScreen() {
  const headingRef = usePageTitle(T.title);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const offline = useIsOffline();
  const holdRedirect = useSignInHold();

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: roleFromQuery(searchParams.get('role')),
      name: '',
      phone: '',
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
  const [role, name, phone, email, password] = useWatch({
    control,
    name: ['role', 'name', 'phone', 'email', 'password'],
  });

  /** @param {import('zod').infer<typeof registerSchema>} values */
  async function onSubmit(values) {
    clearProblem();
    const phoneNumber = /** @type {string} */ (normalizePhone(values.phone));
    const fields = {
      name: values.name,
      phoneNumber,
      email: values.email,
      password: values.password,
    };
    try {
      await (values.role === 'farmer' ? registerFarmer(fields) : registerBuyer(fields));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) showError(error, { text: T.exists });
      else showError(error);
      return;
    }

    // Account created: sign in with the same credentials (the normalised phone number).
    // PublicOnly waits until this screen has navigated away (the hold ends when it unmounts).
    holdRedirect();
    try {
      const session = await signIn(phoneNumber, values.password);
      await navigate(getPostLoginPath(session, null), { replace: true });
    } catch {
      setFlash(MESSAGES.flash.accountCreated);
      await navigate('/login', { replace: true });
    }
  }

  const roleError = errors.role?.message;

  return (
    <AuthLayout title={T.title} subtitle={T.subtitle} headingRef={headingRef}>
      <p className="flex items-start gap-2 rounded-lg border border-border bg-canvas px-4 py-3 text-sm text-text">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{T.info}</span>
      </p>
      <FormErrorSummary
        ref={summaryRef}
        problems={problem?.problems ?? []}
        reference={problem?.reference}
      >
        {problem?.code === 'conflict' || problem?.code === 'user_exists' ? (
          <p className="flex flex-wrap gap-x-4 text-sm">
            <Link className={linkClass} to="/login">
              {T.signIn}
            </Link>
            <Link className={linkClass} to="/forgot-password">
              {T.resetPassword}
            </Link>
          </p>
        ) : null}
      </FormErrorSummary>
      <OfflineFormNotice offline={offline} />
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={roleError ? errorId('register-role') : undefined}
        >
          <legend className="mb-2 text-sm font-medium text-text">{T.roleLegend}</legend>
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
          <FieldError id="register-role" message={roleError} />
        </fieldset>

        <FormField
          id="register-name"
          label={T.nameLabel}
          type="text"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <FormField
          id="register-phone"
          label={T.phoneLabel}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint={T.phoneHint}
          error={errors.phone?.message}
          {...register('phone')}
        />
        <FormField
          id="register-email"
          label={T.emailLabel}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          hint={T.emailHint}
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          id="register-password"
          label={T.passwordLabel}
          autoComplete="new-password"
          error={errors.password?.message}
          describedByIds={['register-password-requirements']}
          {...register('password')}
        >
          <PasswordRequirements
            id="register-password-requirements"
            password={password}
            context={{ role, name, phone, email, characterClasses: true }}
          />
        </PasswordField>
        <PasswordField
          id="register-confirmPassword"
          label={T.confirmLabel}
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
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
      <p className="flex flex-wrap items-center gap-x-2 text-text-secondary">
        <span>{T.haveAccount}</span>
        <Link className={linkClass} to="/login">
          {T.signIn}
        </Link>
      </p>
    </AuthLayout>
  );
}
