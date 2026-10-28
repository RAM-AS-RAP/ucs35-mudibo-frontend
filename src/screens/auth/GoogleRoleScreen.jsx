import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { AlertTriangle, Info, ShoppingBasket, Sprout } from 'lucide-react';
import { ApiError, getUserMessage } from '@/api/errors';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormErrorSummary } from '@/components/auth/FormErrorSummary';
import { SubmitButton } from '@/components/auth/CountdownButton';
import { OfflineFormNotice } from '@/components/auth/FormNotices';
import { useServerProblem } from '@/components/auth/useServerProblem';
import { completeGoogleSignup, GOOGLE_RESTART_CODES, useSignInHold } from '@/auth/auth';
import { clearFlow, getGoogleFlowView, useGoogleFlowView } from '@/auth/flow';
import { fromState, getPostLoginPath } from '@/auth/redirects';
import { setFlash } from '@/auth/session';
import { LOGIN_PATH } from '@/auth/paths';
import { useIsOffline } from '@/lib/connectivity';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import { cn } from '@/lib/utils';

const T = MESSAGES.googleRole;
const ROLE_OPTIONS = [
  { value: 'farmer', label: T.farmer, hint: T.farmerHint, icon: Sprout },
  { value: 'buyer', label: T.buyer, hint: T.buyerHint, icon: ShoppingBasket },
];

/**
 * The one time role choice of a new Google account (/google/role). The signup token stays in
 * the in memory flow store; this screen shows only the person's own Google name and email.
 * There is no default choice: a role card is preselected only when the person picked one on
 * the registration screen, and the account is created only by "Create my account"
 * (POST /auth/google/complete with exactly {signup_token, role}).
 */
export default function GoogleRoleScreen() {
  const headingRef = usePageTitle(T.pageTitle);
  const navigate = useNavigate();
  const location = useLocation();
  const offline = useIsOffline();
  const holdRedirect = useSignInHold();
  const busy = useRef(false);
  const [initial] = useState(() => {
    const view = getGoogleFlowView();
    if (!view) setFlash(MESSAGES.flash.flowLost);
    return view;
  });
  // Keep showing the screen while Cancel clears the flow and navigates away.
  const flow = useGoogleFlowView() ?? initial;

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { isSubmitting },
  } = useForm({ defaultValues: { role: initial?.preferredRole ?? '' } });
  const { problem, summaryRef, showError, clearProblem, countdown } = useServerProblem({
    setError,
    idPrefix: 'google-role',
    fieldMap: { role: 'role' },
  });
  const role = useWatch({ control, name: 'role' });
  const chosen = role === 'farmer' || role === 'buyer' ? role : null;

  if (!initial || !flow) return <Navigate to={LOGIN_PATH} replace />;

  /** @param {{ role: string }} values */
  async function onSubmit(values) {
    if (busy.current) return;
    const picked = values.role === 'farmer' || values.role === 'buyer' ? values.role : null;
    if (!picked) return;
    busy.current = true;
    clearProblem();
    const release = holdRedirect();
    try {
      const result = await completeGoogleSignup(picked);
      if (result.status === 'code_required') {
        await navigate('/login/code', { replace: true, state: fromState(location.state) });
      } else {
        await navigate(getPostLoginPath(result.session, null), { replace: true });
      }
    } catch (error) {
      release();
      if (error instanceof ApiError && GOOGLE_RESTART_CODES.includes(error.code)) {
        // The flow is already cleared: start again from the sign in screen.
        setFlash(getUserMessage(error));
        navigate(LOGIN_PATH, { replace: true, state: fromState(location.state) });
        return;
      }
      if (error instanceof ApiError && error.code === 'flow_lost') {
        setFlash(MESSAGES.flash.flowLost);
        navigate(LOGIN_PATH, { replace: true });
        return;
      }
      showError(error);
    } finally {
      busy.current = false;
    }
  }

  return (
    <AuthLayout
      title={T.welcome(flow.name)}
      subtitle={flow.email ? T.signingUpWith(flow.email) : undefined}
      headingRef={headingRef}
    >
      <p className="flex items-start gap-2 rounded-lg border border-border bg-canvas px-4 py-3 text-sm text-text">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{MESSAGES.register.info}</span>
      </p>
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
        <fieldset className="flex flex-col gap-2" aria-describedby="google-role-warning">
          <legend className="mb-2 text-sm font-medium text-text">{T.legend}</legend>
          {ROLE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const checked = role === option.value;
            return (
              <label
                key={option.value}
                htmlFor={`google-role-${option.value}`}
                className={cn(
                  'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
                  checked ? 'border-primary bg-canvas' : 'border-border bg-card',
                )}
              >
                <input
                  id={`google-role-${option.value}`}
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
        </fieldset>
        <p
          id="google-role-warning"
          className="flex items-start gap-2 rounded-lg border border-negative bg-card px-4 py-3 text-sm font-medium text-text"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
          <span>{T.warning}</span>
        </p>
        <SubmitButton
          pending={isSubmitting}
          pendingLabel={T.pending}
          remaining={countdown.remaining}
          disabled={!chosen || offline || countdown.longWait}
        >
          {T.submit}
        </SubmitButton>
      </form>
      <Link
        className="flex min-h-11 items-center text-primary underline underline-offset-2"
        to={LOGIN_PATH}
        replace
        onClick={() => clearFlow()}
      >
        {T.cancel}
      </Link>
    </AuthLayout>
  );
}
