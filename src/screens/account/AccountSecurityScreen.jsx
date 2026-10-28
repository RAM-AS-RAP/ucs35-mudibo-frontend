import { Link } from 'react-router';
import { CheckCircle2, Circle, KeyRound, Mail, UserRound } from 'lucide-react';
import { useMe } from '@/api/queries';
import { PageHeader } from '@/components/display/PageHeader';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { CHANGE_PASSWORD_PATH } from '@/auth/paths';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';

const T = MESSAGES.security;
export const SET_PASSWORD_PATH = '/account/password';
const linkClass =
  'inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2';

/**
 * A state word with its icon (never colour alone).
 * @param {{ on: boolean, children: import('react').ReactNode }} props
 */
function State({ on, children }) {
  const Icon = on ? CheckCircle2 : Circle;
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-text">
      <Icon
        aria-hidden="true"
        className={on ? 'size-4 text-positive' : 'size-4 text-text-secondary'}
      />
      {children}
    </span>
  );
}

/**
 * One sign in method: icon, name, state and what to do.
 * @param {{ icon: import('react').ComponentType<any>, title: string, state: import('react').ReactNode, children?: import('react').ReactNode }} props
 */
function MethodRow({ icon: Icon, title, state, children }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        {state}
      </div>
      {children}
    </li>
  );
}

/**
 * Sign-in methods (/account/security, farmers and buyers): the email, whether a password is set
 * and whether Google is connected, from GET /auth/me. There is no connect or disconnect action:
 * Google connects only by signing in with Google using the same email.
 */
export default function AccountSecurityScreen() {
  const headingRef = usePageTitle(T.title);
  const me = useMe();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={T.title} description={T.subtitle} headingRef={headingRef} />
      {me.isPending && <LoadingState label={T.loading} rows={3} />}
      {me.isError && (
        <ErrorState error={me.error} title={T.errorTitle} onRetry={() => void me.refetch()} />
      )}
      {me.data && (
        <>
          <ul className="flex flex-col gap-3">
            <MethodRow icon={Mail} title={T.emailRow} state={<State on>{T.verified}</State>}>
              <p className="break-all text-text">{me.data.email}</p>
            </MethodRow>
            <MethodRow
              icon={KeyRound}
              title={T.passwordRow}
              state={
                <State on={me.data.password_set}>
                  {me.data.password_set ? T.passwordSet : T.passwordNotSet}
                </State>
              }
            >
              {me.data.password_set ? (
                <Link className={linkClass} to={CHANGE_PASSWORD_PATH}>
                  {T.changePassword}
                </Link>
              ) : (
                <Link className={linkClass} to={SET_PASSWORD_PATH}>
                  {T.setPassword}
                </Link>
              )}
            </MethodRow>
            <MethodRow
              icon={UserRound}
              title={T.googleRow}
              state={
                <State on={me.data.google_linked}>
                  {me.data.google_linked ? T.connected : T.notConnected}
                </State>
              }
            >
              <p className="text-text-secondary">
                {me.data.google_linked ? T.connectedText : T.notConnectedText}
              </p>
              <p className="text-text-secondary">{T.noDisconnect}</p>
            </MethodRow>
          </ul>
          <section aria-labelledby="security-how" className="flex flex-col gap-2">
            <h2 id="security-how" className="text-lg font-semibold text-text">
              {T.howTitle}
            </h2>
            <p className="text-text-secondary">{T.howEmail}</p>
            <p className="text-text-secondary">{T.howGoogle}</p>
          </section>
        </>
      )}
    </div>
  );
}
