import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '@/api/errors';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { CodeEntryForm } from '@/components/auth/CodeEntryForm';
import { InfoMessage } from '@/components/auth/FormNotices';
import { resendLoginCode, useSignInHold } from '@/auth/auth';
import { clearFlow, getFlowView, useFlowView } from '@/auth/flow';
import { fromState, getPostLoginPath } from '@/auth/redirects';
import { setFlash } from '@/auth/session';
import { useAuth } from '@/auth/useAuth';
import { LOGIN_PATH } from '@/auth/paths';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';

const T = MESSAGES.loginCode;

/**
 * The second sign in step (/login/code): the code emailed after the password was checked
 * (POST /auth/login/verify). The challenge token stays in the in memory flow store; a reload
 * or a direct visit has no flow and goes back to /login with the flow_lost message.
 */
export default function LoginCodeScreen() {
  const headingRef = usePageTitle(T.title);
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyLogin } = useAuth();
  const holdRedirect = useSignInHold();
  // Decided once, when the screen opens: success and "Start again" clear the flow later.
  const [initial] = useState(() => {
    const view = getFlowView('login');
    if (!view) setFlash(MESSAGES.flash.flowLost);
    return view;
  });
  const flow = useFlowView('login') ?? initial;

  if (!initial || !flow) return <Navigate to={LOGIN_PATH} replace />;

  /** @param {string} code */
  async function verify(code) {
    const release = holdRedirect();
    try {
      const result = await verifyLogin(code);
      if (result.status === 'code_required') {
        // A new challenge replaced the old one: stay here with its masked email.
        release();
        return;
      }
      await navigate(getPostLoginPath(result.session, location.state), { replace: true });
    } catch (error) {
      release();
      throw error;
    }
  }

  async function resend() {
    const answer = await resendLoginCode();
    return answer.code_sent ? T.sent : T.sendFailed;
  }

  /** @param {unknown} error */
  function onFlowError(error) {
    if (!(error instanceof ApiError)) return false;
    if (error.code !== 'challenge_closed' && error.code !== 'flow_lost') return false;
    clearFlow();
    setFlash(
      error.code === 'challenge_closed' ? MESSAGES.flash.challengeClosed : MESSAGES.flash.flowLost,
    );
    navigate(LOGIN_PATH, { replace: true, state: fromState(location.state) });
    return true;
  }

  return (
    <AuthLayout title={T.title} subtitle={T.intro(flow.emailMasked)} headingRef={headingRef}>
      <CodeEntryForm
        idPrefix="login-code"
        notice={!flow.codeSent && <InfoMessage>{T.notSent}</InfoMessage>}
        submitLabel={T.submit}
        invalidCodeText={T.invalid}
        verify={verify}
        resend={resend}
        onFlowError={onFlowError}
        startAgainTo={LOGIN_PATH}
        onStartAgain={clearFlow}
        help={<p>{MESSAGES.code.spam}</p>}
      />
    </AuthLayout>
  );
}
