import { Link } from 'react-router';
import { ChevronDown, KeyRound, LogOut, ShieldCheck, UserCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/auth/useAuth';
import { CHANGE_PASSWORD_PATH } from '@/auth/paths';
import { MESSAGES } from '@/lib/messages';

export const ROLE_LABEL = { farmer: 'Farmer', buyer: 'Buyer', admin: 'Administrator' };

/** The top bar's account menu: name, role (and "Super admin"), change password, sign out. */
export function AccountMenu() {
  const { session, name, role, isSuperAdmin, logout } = useAuth();
  if (!session) return null;
  const roleLabel = ROLE_LABEL[/** @type {keyof typeof ROLE_LABEL} */ (role)] ?? 'User';
  const displayName = name ?? `${roleLabel} account`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="max-w-[14rem] gap-1.5 px-2 sm:max-w-xs">
          <UserCircle aria-hidden="true" />
          <span className="sr-only">{MESSAGES.account.menu}: </span>
          <span className="truncate">{displayName}</span>
          <ChevronDown aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="font-semibold text-text">{displayName}</span>
          <span className="text-text-secondary">{roleLabel}</span>
          {isSuperAdmin && (
            <Badge variant="neutral">
              <ShieldCheck aria-hidden="true" />
              {MESSAGES.account.superAdmin}
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={CHANGE_PASSWORD_PATH}>
            <KeyRound aria-hidden="true" />
            {MESSAGES.account.changePassword}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={logout}>
          <LogOut aria-hidden="true" />
          {MESSAGES.account.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
