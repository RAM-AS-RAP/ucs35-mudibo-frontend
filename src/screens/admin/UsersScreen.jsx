import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Info, KeyRound, UserCheck, UserX, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';
import { invalidateUsers, useAdminUsers, useDisableUser, useEnableUser } from '@/api/queries/admin';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/display/PageHeader';
import { Segmented } from '@/components/display/Segmented';
import { StatusBadge } from '@/components/display/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { FilterBar, useFilterParams } from '@/components/admin/FilterBar';
import { LoadMore, pagesOf, RefreshButton, ShowingCount } from '@/components/admin/ListParts';
import { ResponsiveTable } from '@/components/admin/ResponsiveTable';
import { RoleBadge } from '@/components/admin/RoleBadge';
import { SearchInput } from '@/components/admin/SearchInput';
import {
  adminErrorMessage,
  isUnknownWriteResult,
  USER_FILTER_OPTIONS,
  USERS_TEXT,
  WRITE_UNKNOWN,
} from '@/lib/adminMessages';
import { formatDateTime } from '@/lib/format';
import { canToggleUser } from '@/lib/userActions';
import { usePageTitle } from '@/lib/usePageTitle';

/** @typedef {import('@/api/endpoints/admin').AdminUser} AdminUser */
/** @typedef {import('@/components/admin/ConfirmDialog').DialogError} DialogError */

const RULES = Object.freeze({
  role: { values: ['all', 'farmer', 'buyer', 'admin'], fallback: 'all' },
  status: { values: ['all', 'active', 'disabled'], fallback: 'all' },
  q: { accept: (/** @type {string} */ v) => v.trim().length >= 2 && v.length <= 50 },
});

/** @param {AdminUser} user */
function activityText(user) {
  if (user.role === 'farmer' && typeof user.listing_count === 'number') {
    return USERS_TEXT.listings(user.listing_count);
  }
  if (user.role === 'buyer' && typeof user.order_count === 'number') {
    return USERS_TEXT.orders(user.order_count);
  }
  return USERS_TEXT.noActivity;
}

/** @type {ReadonlyArray<import('@/components/admin/ResponsiveTable').Column<AdminUser>>} */
const COLUMNS = [
  {
    key: 'name',
    header: USERS_TEXT.name,
    cell: (u) => (
      <span className="flex flex-wrap items-center gap-2">
        <span>{u.name}</span>
        {u.is_super_admin === true && <RoleBadge userRole="admin" isSuperAdmin />}
      </span>
    ),
  },
  { key: 'role', header: USERS_TEXT.role, cell: (u) => <RoleBadge userRole={u.role} /> },
  { key: 'phone', header: USERS_TEXT.phone, cell: (u) => u.phone_number },
  { key: 'email', header: USERS_TEXT.email, cell: (u) => u.email ?? USERS_TEXT.noEmail },
  {
    key: 'status',
    header: USERS_TEXT.status,
    wrap: true,
    cell: (u) => (
      <span className="flex flex-col gap-1">
        <StatusBadge kind="user" status={u.is_disabled ? 'disabled' : 'active'} />
        {u.is_disabled && u.disabled_at && (
          <span className="text-sm text-text-secondary">
            {USERS_TEXT.disabledSince(formatDateTime(u.disabled_at), u.disabled_by_name)}
          </span>
        )}
        {u.must_change_password && (
          <span className="flex items-center gap-1 text-sm text-text-secondary">
            <KeyRound aria-hidden="true" className="size-4" />
            {USERS_TEXT.mustChangePassword}
          </span>
        )}
      </span>
    ),
  },
  { key: 'activity', header: USERS_TEXT.activity, cell: activityText },
  {
    key: 'created',
    header: USERS_TEXT.created,
    wrap: true,
    cell: (u) => (
      <span className="flex flex-col">
        <span>{formatDateTime(u.created_at)}</span>
        <span className="text-sm text-text-secondary">
          {u.created_by_name ? USERS_TEXT.createdBy(u.created_by_name) : USERS_TEXT.selfRegistered}
        </span>
      </span>
    ),
  },
];

/**
 * Users (/admin/users): every account with role and status filters and a search by name, email
 * or phone (2 to 50 characters, 400 ms after typing). Disable or Enable appears only where
 * canToggleUser allows it, and always goes through a confirmation. The server stays the
 * authority: its 403 answers are shown in the dialog and the list is refreshed.
 */
export default function UsersScreen() {
  const headingRef = usePageTitle(USERS_TEXT.title);
  const session = useSession();
  const client = useQueryClient();
  const filters = useFilterParams(RULES);
  const { role, status, q } = filters.values;
  const queryFilters = useMemo(
    () => ({
      role: role === 'all' ? null : /** @type {import('@/api/endpoints/admin').UserRole} */ (role),
      isDisabled: status === 'all' ? null : status === 'disabled',
      q,
    }),
    [role, status, q],
  );
  const query = useAdminUsers(queryFilters);
  const disable = useDisableUser();
  const enable = useEnableUser();

  const [target, setTarget] = useState(
    /** @type {{ user: AdminUser, action: 'disable' | 'enable' } | null} */ (null),
  );
  const [dialogError, setDialogError] = useState(/** @type {DialogError | null} */ (null));
  const [open, setOpen] = useState(false);
  const opener = useRef(/** @type {HTMLElement | null} */ (null));

  const actor = { id: session?.userId ?? null, isSuperAdmin: session?.isSuperAdmin === true };
  const setFilters = filters.set;
  const onSearch = useCallback(
    (/** @type {string | null} */ text) => setFilters({ q: text }),
    [setFilters],
  );

  /** @param {AdminUser} user @param {'disable' | 'enable'} action */
  function ask(user, action) {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
    setTarget({ user, action });
    setDialogError(null);
    setOpen(true);
  }

  async function run() {
    if (!target) return;
    const { user, action } = target;
    const mutation = action === 'disable' ? disable : enable;
    try {
      await mutation.mutateAsync(user.id);
      setOpen(false);
      toast.success(
        action === 'disable'
          ? USERS_TEXT.disabledToast(user.name)
          : USERS_TEXT.enabledToast(user.name),
      );
    } catch (error) {
      if (isUnknownWriteResult(error)) {
        setDialogError({ message: WRITE_UNKNOWN.list, final: true });
        return;
      }
      setDialogError({
        message: adminErrorMessage(error, { userAction: true }),
        reference: error instanceof ApiError ? error.requestId : null,
        final: error instanceof ApiError && (error.status === 403 || error.status === 404),
      });
      // The server refused: show its current list.
      void invalidateUsers(client);
    }
  }

  const { items, total } = pagesOf(query.data);
  const pending = disable.isPending || enable.isPending;

  let body;
  if (query.isPending) {
    body = <LoadingState label={USERS_TEXT.loading} rows={3} />;
  } else if (query.isError && !query.isFetchNextPageError) {
    body = (
      <ErrorState
        error={query.error}
        title={USERS_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={Users}
        title={filters.active ? USERS_TEXT.emptyFilteredTitle : USERS_TEXT.emptyTitle}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ShowingCount shown={items.length} total={total} />
        <ResponsiveTable
          caption={USERS_TEXT.caption}
          captionHidden
          columns={COLUMNS}
          rows={items}
          rowKey={(u) => u.id}
          actions={(user) =>
            canToggleUser({ actor, target: user }) ? (
              user.is_disabled ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${USERS_TEXT.enable} ${user.name}`}
                  onClick={() => ask(user, 'enable')}
                  disabled={pending}
                >
                  <UserCheck aria-hidden="true" />
                  {USERS_TEXT.enable}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${USERS_TEXT.disable} ${user.name}`}
                  onClick={() => ask(user, 'disable')}
                  disabled={pending}
                >
                  <UserX aria-hidden="true" />
                  {USERS_TEXT.disable}
                </Button>
              )
            ) : null
          }
        />
        <LoadMore query={query} errorTitle={USERS_TEXT.errorTitle} />
      </div>
    );
  }

  const disabling = target?.action === 'disable';
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={USERS_TEXT.title}
        description={USERS_TEXT.description}
        headingRef={headingRef}
        actions={
          <RefreshButton
            onRefresh={() => query.refetch()}
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            disabled={query.isPending}
          />
        }
      />
      <p className="flex items-start gap-2 text-sm text-text-secondary" data-testid="password-note">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{USERS_TEXT.passwordNote}</span>
      </p>
      <FilterBar label={USERS_TEXT.filterLabel} active={filters.active} onClear={filters.clear}>
        <Segmented
          legend={USERS_TEXT.roleLegend}
          name="admin-user-role"
          options={USER_FILTER_OPTIONS.role}
          value={/** @type {any} */ (role)}
          onChange={(value) => filters.set({ role: value })}
        />
        <Segmented
          legend={USERS_TEXT.statusLegend}
          name="admin-user-status"
          options={USER_FILTER_OPTIONS.status}
          value={/** @type {any} */ (status)}
          onChange={(value) => filters.set({ status: value })}
        />
        <SearchInput label={USERS_TEXT.searchLabel} value={q} onSearch={onSearch} />
      </FilterBar>
      {body}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={
          target
            ? disabling
              ? USERS_TEXT.disableTitle(target.user.name)
              : USERS_TEXT.enableTitle(target.user.name)
            : ''
        }
        description={disabling ? USERS_TEXT.disableBody : USERS_TEXT.enableBody}
        confirmLabel={disabling ? USERS_TEXT.disableConfirm : USERS_TEXT.enableConfirm}
        pendingLabel={disabling ? USERS_TEXT.disabling : USERS_TEXT.enabling}
        destructive={disabling}
        pending={pending}
        onConfirm={run}
        error={dialogError}
        returnFocus={() => (opener.current?.isConnected ? opener.current : headingRef.current)}
      />
    </div>
  );
}
