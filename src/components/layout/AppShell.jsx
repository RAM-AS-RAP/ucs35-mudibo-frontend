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

/** The small label above the sidebar links. */
const ROLE_LABEL = Object.freeze({
  farmer: 'Farmer',
  buyer: 'Buyer',
  admin: 'Administration',
});

/**
 * @param {{ items: import('./navConfig').NavItem[], onNavigate?: () => void }} props
 */
function SideNavList({ items, onNavigate }) {
  return (
    <ul className="flex flex-col gap-1 px-3 pb-3">
      {items.map(({ label, to, icon: Icon, end, badge }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 font-medium transition-colors focus-visible:outline-card',
                isActive
                  ? 'bg-card font-semibold text-primary shadow-card'
                  : 'text-on-primary-muted hover:bg-card/10 hover:text-on-primary',
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

      {/* Large screens: a fixed, full height green sidebar with the logo at the top. */}
      <aside className="bg-sidebar-brand fixed inset-y-0 left-0 z-40 hidden w-64 flex-col text-sidebar-foreground lg:flex">
        <div className="flex h-16 shrink-0 items-center px-4">
          <Link
            to={home}
            className="flex min-h-11 items-center rounded-lg px-1 focus-visible:outline-card"
          >
            <BrandMark inverse />
          </Link>
        </div>
        <p className="px-6 pt-4 pb-1 text-xs font-semibold tracking-wider text-on-primary-muted uppercase">
          {ROLE_LABEL[/** @type {keyof typeof ROLE_LABEL} */ (role)] ?? 'Menu'}
        </p>
        <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto">
          <SideNavList items={items} />
        </nav>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card/95 px-3 shadow-card backdrop-blur-sm sm:px-4 lg:px-6">
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
          <Link to={home} className="flex min-h-11 shrink-0 items-center rounded-lg px-1 lg:hidden">
            <BrandMark />
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <AccountMenu />
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
