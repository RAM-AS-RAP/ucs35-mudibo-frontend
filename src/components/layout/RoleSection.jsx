import { useLocation } from 'react-router';
import { PageHeader } from '@/components/display/PageHeader';
import { ComingSoon } from '@/components/display/ComingSoon';
import NotFoundScreen from '@/screens/shared/NotFoundScreen';
import { NAV_ITEMS } from './navConfig';

/**
 * F0 placeholder body for a role area: the page title from the navigation item that
 * matches the current path, and a "coming soon" card naming the module that builds it.
 * @param {{ area: 'farmer' | 'buyer' | 'admin', module: string }} props
 */
export function RoleSection({ area, module }) {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, '') || '/';
  const item = NAV_ITEMS[area].find((navItem) => navItem.to === path);
  if (!item) return <NotFoundScreen embedded />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={item.label} />
      <ComingSoon feature={item.label} module={module} />
    </div>
  );
}
