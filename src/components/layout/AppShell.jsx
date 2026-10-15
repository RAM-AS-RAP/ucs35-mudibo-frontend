import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { LogOut, Menu, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { clear, useSession } from '@/auth/session';
import { ROLE_HOME } from '@/auth/roles';
import { cn } from '@/lib/utils';
import { BOTTOM_NAV_ROLES, getNavItems } from './navConfig';

const ROLE_LABEL = { farmer: 'Farmer', buyer: 'Buyer', admin: 'Administrator' };
const BOTTOM_COLS = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

/**
 * @param {{ items: import('./navConfig').NavItem[], onNavigate?: () => void }} props
 */
function SideNavList({ items, onNavigate }) {
  return (
    <ul className="flex flex-col gap-1 p-3">
      {items.map(({ label, to, icon: Icon, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 font-medium transition-colors',
                isActive ? 'bg-primary text-on-primary' : 'text-text hover:bg-card',
              )
            }
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span>{label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/** @param {{ items: import('./navConfig').NavItem[] }} props */
function BottomNav({ items }) {
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className={cn('grid', BOTTOM_COLS[/** @type {1|2|3|4|5} */ (Math.min(items.length, 5))])}>
        {items.map(({ label, to, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1 text-center text-xs leading-tight font-medium',
                  isActive ? 'bg-primary text-on-primary' : 'text-text',
                )
              }
            >
              <Icon aria-hidden="true" className="size-5" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The signed in layout: skip link, top bar (name and logout), sidebar on large screens,
 * bottom bar on small screens for farmer and buyer, and a drawer on small screens for admin.
 * @param {{ children?: import('react').ReactNode }} props
 */
export function AppShell({ children }) {
  const session = useSession();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!session) return null;
  const role = session.role;
  const items = getNavItems(role, { isSuperAdmin: session.isSuperAdmin });
  const hasBottomNav = BOTTOM_NAV_ROLES.has(role);
  const home = ROLE_HOME[/** @type {keyof typeof ROLE_HOME} */ (role)] ?? '/';
  const displayName =
    session.name ??
    `${ROLE_LABEL[/** @type {keyof typeof ROLE_LABEL} */ (role)] ?? 'User'} account`;

  function logout() {
    clear('logout');
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-4 py-3 text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card px-3 sm:px-4">
        {!hasBottomNav && (
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>AgriSence</SheetTitle>
                <SheetDescription>Administration menu</SheetDescription>
              </SheetHeader>
              <nav aria-label="Drawer navigation">
                <SideNavList items={items} onNavigate={() => setDrawerOpen(false)} />
              </nav>
            </SheetContent>
          </Sheet>
        )}
        <Link
          to={home}
          className="flex min-h-11 items-center gap-2 rounded-md px-1 text-lg font-bold text-primary"
        >
          <Sprout aria-hidden="true" className="size-6" />
          <span>AgriSence</span>
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <span
            className="max-w-[9rem] truncate text-sm text-text-secondary sm:max-w-xs"
            title={displayName}
          >
            {displayName}
          </span>
          <Button type="button" variant="outline" onClick={logout}>
            <LogOut aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Log out</span>
          </Button>
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
          className={cn(
            'mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 py-6 outline-none',
            hasBottomNav ? 'pb-24 lg:pb-6' : '',
          )}
        >
          {children}
        </main>
      </div>

      {hasBottomNav && <BottomNav items={items} />}
    </div>
  );
}
