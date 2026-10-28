import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, LogOut } from 'lucide-react';
import { changePassword } from '@/api/endpoints';
import { ApiError, ERROR_MESSAGES } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PasswordField } from '@/components/auth/PasswordField';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
import { FormErrorSummary } from '@/components/auth/FormErrorSummary';
import { SubmitButton } from '@/components/auth/CountdownButton';
import { OfflineFormNotice } from '@/components/auth/FormNotices';
import { useServerProblem } from '@/components/auth/useServerProblem';
import { useAuth } from '@/auth/useAuth';
import { clear } from '@/auth/session';
import { homeForRole } from '@/auth/roles';
import { LOGIN_PATH } from '@/auth/paths';
import { useIsOffline } from '@/lib/connectivity';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import { changePasswordSchema } from '@/lib/validation';

const T = MESSAGES.change;
const SET_PASSWORD_PATH = '/account/password';
const linkClass =
  'inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2';

/** An account created with Google has no password yet: it sets one from Sign-in methods. */
function PasswordNotSet() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-canvas px-4 py-3">
      <p className="flex items-start gap-2 text-text">
        <KeyRound aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <span>{ERROR_MESSAGES.password_not_set}</span>
      </p>
      <Link className={linkClass} to={SET_PASSWORD_PATH}>
        {T.setPasswordLink}
      </Link>
    </div>
  );
}
const SERVER_FIELDS = {
  current_password: 'currentPassword',
  new_password: 'newPassword',
  // A new password equal to the current one is a model level error, reported on "request".
  request: 'newPassword',
};

/**
 * Change the password (POST /auth/change-password). Forced when the session must change its
 * password (the guards allow no other screen, only sign out); voluntary from the account menu.
 * The backend revokes every older token, so success signs the user out.
 */
export default function ChangePasswordScreen() {
  const { session, logout } = useAuth();
  const forced = Boolean(session?.mustChangePassword);
  // Only farmers and buyers can have an account without a password (created with Google).
  const noPassword = session?.passwordSet === false && !forced;
  const title = forced ? T.forcedTitle : T.voluntaryTitle;
  const headingRef = usePageTitle(title);
  const navigate = useNavigate();
  const offline = useIsOffline();
  const role = session?.role ?? null;
  const name = session?.name ?? null;
  const schema = useMemo(() => changePasswordSchema({ role, name }), [role, name]);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const { problem, summaryRef, showError, clearProblem, countdown } = useServerProblem({
    setError,
    idPrefix: 'change',
    fieldMap: SERVER_FIELDS,
    passwordField: 'newPassword',
  });
  const newPassword = useWatch({ control, name: 'newPassword' });

  /** @param {import('zod').infer<ReturnType<typeof changePasswordSchema>>} values */
  async function onSubmit(values) {
    clearProblem();
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'wrong_current_password') {
        const text = MESSAGES.field.wrongCurrent;
        setError('currentPassword', { type: 'server', message: text });
        showError(error, { text, fieldId: 'change-currentPassword' });
      } else {
        showError(error);
      }
      return;
    }
    // Every earlier token is revoked (login_required): sign in again with the new password.
    clear('password_changed');
    navigate(LOGIN_PATH, { replace: true });
  }

  const home = homeForRole(role) ?? LOGIN_PATH;

  return (
    <AuthLayout
      title={title}
      subtitle={forced ? T.forcedText : T.voluntaryText}
      headingRef={headingRef}
    >
      {noPassword && <PasswordNotSet />}
      <FormErrorSummary
        ref={summaryRef}
        problems={problem?.problems ?? []}
        reference={problem?.reference}
      >
        {problem?.code === 'password_not_set' && (
          <Link className={linkClass} to={SET_PASSWORD_PATH}>
            {T.setPasswordLink}
          </Link>
        )}
      </FormErrorSummary>
      <OfflineFormNotice offline={offline} />
      {!noPassword && (
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <PasswordField
            id="change-currentPassword"
            label={T.currentLabel}
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />
          <PasswordField
            id="change-newPassword"
            label={T.newLabel}
            autoComplete="new-password"
            error={errors.newPassword?.message}
            describedByIds={['change-newPassword-requirements']}
            {...register('newPassword')}
          >
            <PasswordRequirements
              id="change-newPassword-requirements"
              password={newPassword}
              context={{ role, name, characterClasses: true }}
            />
          </PasswordField>
          <PasswordField
            id="change-confirmPassword"
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
      )}
      <div className="flex flex-wrap gap-2">
        {!forced && (
          <Button asChild variant="outline">
            <Link to={home}>{T.cancel}</Link>
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={logout}>
          <LogOut aria-hidden="true" />
          {T.signOut}
        </Button>
      </div>
    </AuthLayout>
  );
}
