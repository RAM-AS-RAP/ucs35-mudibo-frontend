import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useSession } from '@/auth/session';
import { ROLE_HOME } from '@/auth/roles';
import { cn } from '@/lib/utils';
import { AccountMenu } from './AccountMenu';
import { BrandMark } from './BrandMark';
import { DRAWER_DESCRIPTION, getNavItems } from './navConfig';
import { NavBadge } from './NavBadge';

/**
 * @param {{ items: import('./navConfig').NavItem[], onNavigate?: () => void }} props
 */
function SideNavList({ items, onNavigate }) {
  return (
    <ul className="flex flex-col gap-1 p-3">
      {items.map(({ label, to, icon: Icon, end, badge }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 font-medium transition-colors',
                isActive
                  ? 'bg-primary-soft font-semibold text-primary before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary'
                  : 'text-text-secondary hover:bg-card hover:text-text',
              )
            }
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span>{label}</span>
            {badge && <NavBadge kind={badge} />}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * The signed in layout: skip link, top bar (account menu), sidebar on large screens and a
 * drawer opened by a hamburger button on small screens, for every role. The hamburger button
 * repeats a navigation count (the buyer's orders waiting for payment, the administrator's
 * orders to review) so it stays visible while the drawer is closed.
 * @param {{ children?: import('react').ReactNode }} props
 */
export function AppShell({ children }) {
  const session = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!session) return null;
  const role = session.role;
  const items = getNavItems(role, { isSuperAdmin: session.isSuperAdmin });
  const drawerBadge = items.find((item) => item.badge)?.badge;
  const home = ROLE_HOME[/** @type {keyof typeof ROLE_HOME} */ (role)] ?? '/';

  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-4 py-3 text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card/95 px-3 shadow-card backdrop-blur-sm sm:px-4">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              {/* The label first, so the name reads "Open navigation menu, 1 order ...". */}
              <span className="sr-only">Open navigation menu</span>
              <span className="relative">
                <Menu aria-hidden="true" />
                {drawerBadge && <NavBadge kind={drawerBadge} compact />}
              </span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 max-w-[80vw] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>AgriSence</SheetTitle>
              <SheetDescription>
                {DRAWER_DESCRIPTION[/** @type {keyof typeof DRAWER_DESCRIPTION} */ (role)] ??
                  'Menu'}
              </SheetDescription>
            </SheetHeader>
            <nav aria-label="Drawer navigation">
              <SideNavList items={items} onNavigate={() => setDrawerOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>
        <Link to={home} className="flex min-h-11 shrink-0 items-center rounded-lg px-1">
          <BrandMark />
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <AccountMenu />
        </div>
      </header>

      <div className="lg:flex">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar lg:block lg:min-h-[calc(100dvh-4rem)]">
          <nav aria-label="Main navigation">
            <SideNavList items={items} />
          </nav>
        </aside>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 py-6 outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
