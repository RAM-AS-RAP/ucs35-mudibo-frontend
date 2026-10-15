import {
  BarChart3,
  ClipboardList,
  CreditCard,
  Gauge,
  LayoutDashboard,
  LineChart,
  MailPlus,
  Package,
  ShoppingBag,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';

/**
 * @typedef {object} NavItem
 * @property {string} label
 * @property {string} to
 * @property {import('react').ComponentType<any>} icon
 * @property {boolean} [end]  match the path exactly (role home)
 * @property {boolean} [superAdminOnly]
 */

/** Placeholder navigation per role. Screens arrive in F2 (farmer), F3 (buyer) and F4 (admin). */
/** @type {Record<string, NavItem[]>} */
export const NAV_ITEMS = {
  farmer: [
    { label: 'Overview', to: '/farmer', icon: LayoutDashboard, end: true },
    { label: 'Prices', to: '/farmer/prices', icon: LineChart },
    { label: 'Forecast', to: '/farmer/forecast', icon: TrendingUp },
    { label: 'My listings', to: '/farmer/listings', icon: Package },
    { label: 'Orders', to: '/farmer/orders', icon: ClipboardList },
  ],
  buyer: [
    { label: 'Browse', to: '/buyer', icon: Store, end: true },
    { label: 'My orders', to: '/buyer/orders', icon: ShoppingBag },
  ],
  admin: [
    { label: 'Overview', to: '/admin', icon: Gauge, end: true },
    { label: 'Users', to: '/admin/users', icon: Users },
    { label: 'Invites', to: '/admin/invites', icon: MailPlus, superAdminOnly: true },
    { label: 'Listings', to: '/admin/listings', icon: Package },
    { label: 'Orders', to: '/admin/orders', icon: ClipboardList },
    { label: 'Payments', to: '/admin/payments', icon: CreditCard },
    { label: 'Forecast accuracy', to: '/admin/forecast-accuracy', icon: BarChart3 },
  ],
};

/** Roles that get a bottom navigation bar on small screens (admin uses a drawer). */
export const BOTTOM_NAV_ROLES = new Set(['farmer', 'buyer']);

/**
 * Navigation items visible to a session. Hiding an item is a convenience only;
 * the server checks every role.
 * @param {string} role
 * @param {{ isSuperAdmin?: boolean }} [options]
 * @returns {NavItem[]}
 */
export function getNavItems(role, { isSuperAdmin = false } = {}) {
  const items = NAV_ITEMS[role] ?? [];
  return items.filter((item) => !item.superAdminOnly || isSuperAdmin);
}
