import { useLocation } from 'react-router';
import { PageHeader } from '@/components/display/PageHeader';
import { ComingSoon } from '@/components/display/ComingSoon';
import NotFoundScreen from '@/screens/shared/NotFoundScreen';
import { useSession } from '@/auth/session';
import { MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import { NAV_ITEMS } from './navConfig';

/**
 * F0 placeholder body for a role area: the page title from the navigation item that
 * matches the current path, and a "coming soon" card naming the module that builds it.
 * The role home also greets the user by name, so a successful sign in is visible.
 * @param {{ area: 'farmer' | 'buyer' | 'admin', module: string }} props
 */
export function RoleSection({ area, module }) {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, '') || '/';
  const item = NAV_ITEMS[area].find((navItem) => navItem.to === path);
  const session = useSession();
  const headingRef = usePageTitle(item?.label ?? 'Page not found');
  if (!item) return <NotFoundScreen embedded />;
  const welcome = session?.name
    ? MESSAGES.account.welcome(session.name)
    : MESSAGES.account.welcomeGeneric;
  return (
    <div className="flex flex-col gap-6">
      {item.end && <p className="text-lg font-medium text-text">{welcome}</p>}
      <PageHeader title={item.label} headingRef={headingRef} />
      <ComingSoon feature={item.label} module={module} />
    </div>
  );
}
