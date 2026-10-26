import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { ApiError } from '@/api/errors';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { CodeEntryForm } from '@/components/auth/CodeEntryForm';
import { resendRegistration, useSignInHold } from '@/auth/auth';
import { clearFlow, getFlowView, useFlowView } from '@/auth/flow';
import { getPostLoginPath } from '@/auth/redirects';
import { setFlash } from '@/auth/session';
import { useAuth } from '@/auth/useAuth';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';

const T = MESSAGES.registerVerify;
const REGISTER_PATH = '/register';
const inlineLink = 'inline-flex min-h-11 items-center text-primary underline underline-offset-2';

/**
 * Confirm the email of a new account (/register/verify, POST /auth/register/verify). The text
 * is the same whether or not the address already has an account: the screen never says which.
 * The registration code is the second step, so success signs the person in directly.
 */
export default function RegisterVerifyScreen() {
  const headingRef = usePageTitle(T.title);
  const navigate = useNavigate();
  const { verifyRegistration } = useAuth();
  const holdRedirect = useSignInHold();
  const [initial] = useState(() => {
    const view = getFlowView('register');
    if (!view) setFlash(MESSAGES.flash.registrationLost);
    return view;
  });
  const flow = useFlowView('register') ?? initial;

  if (!initial || !flow) return <Navigate to={REGISTER_PATH} replace />;

  /** @param {string} code */
  async function verify(code) {
    const release = holdRedirect();
    try {
      const result = await verifyRegistration(code);
      // Handled for completeness: a server setting could ask for a sign in code here too.
      if (result.status === 'code_required') await navigate('/login/code', { replace: true });
      else await navigate(getPostLoginPath(result.session, null), { replace: true });
    } catch (error) {
      release();
      throw error;
    }
  }

  async function resend() {
    await resendRegistration();
    return T.resent;
  }

  /** @param {unknown} error */
  function onFlowError(error) {
    if (!(error instanceof ApiError) || error.code !== 'flow_lost') return false;
    clearFlow();
    setFlash(MESSAGES.flash.registrationLost);
    navigate(REGISTER_PATH, { replace: true });
    return true;
  }

  return (
    <AuthLayout title={T.title} subtitle={T.intro(flow.emailMasked)} headingRef={headingRef}>
      <CodeEntryForm
        idPrefix="register-code"
        submitLabel={T.submit}
        invalidCodeText={T.invalid}
        verify={verify}
        resend={resend}
        onFlowError={onFlowError}
        startAgainTo={REGISTER_PATH}
        onStartAgain={clearFlow}
        help={
          <>
            <p>
              {T.haveAccount}{' '}
              <Link className={inlineLink} to="/login">
                {T.signIn}
              </Link>{' '}
              {T.or}{' '}
              <Link className={inlineLink} to="/forgot-password">
                {T.resetPassword}
              </Link>
              .
            </p>
            <p>{MESSAGES.code.spam}</p>
          </>
        }
      />
    </AuthLayout>
  );
}
