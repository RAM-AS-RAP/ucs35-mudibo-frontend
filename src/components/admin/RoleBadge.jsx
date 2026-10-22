import { Crown, ShieldCheck, ShoppingBag, Sprout, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ROLE_WORDS } from '@/lib/adminMessages';

const ROLE_STYLE = {
  farmer: { label: ROLE_WORDS.farmer, Icon: Sprout },
  buyer: { label: ROLE_WORDS.buyer, Icon: ShoppingBag },
  admin: { label: ROLE_WORDS.admin, Icon: ShieldCheck },
};

/**
 * A role as an icon and a word: Farmer, Buyer, Admin, or "Main admin" for the main
 * administrator (is_super_admin from the server, never inferred).
 * @param {{ userRole: string, isSuperAdmin?: boolean, className?: string }} props
 */
export function RoleBadge({ userRole: role, isSuperAdmin = false, className }) {
  if (role === 'admin' && isSuperAdmin === true) {
    return (
      <Badge variant="default" className={className} data-role="super_admin">
        <Crown aria-hidden="true" />
        <span>{ROLE_WORDS.superAdmin}</span>
      </Badge>
    );
  }
  const style = Object.prototype.hasOwnProperty.call(ROLE_STYLE, role)
    ? ROLE_STYLE[/** @type {keyof typeof ROLE_STYLE} */ (role)]
    : { label: role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Unknown', Icon: UserRound };
  const { Icon } = style;
  return (
    <Badge variant="outline" className={className} data-role={role}>
      <Icon aria-hidden="true" />
      <span>{style.label}</span>
    </Badge>
  );
}
