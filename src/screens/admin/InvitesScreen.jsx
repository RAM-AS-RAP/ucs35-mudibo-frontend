import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Lock,
  Mail,
  MailPlus,
  Send,
  Trash2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/queries/keys';
import {
  useAdminInvites,
  useCreateInvite,
  useResendInvite,
  useRevokeInvite,
  useSendTestEmail,
} from '@/api/queries/admin';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CountdownButton, SubmitButton } from '@/components/auth/CountdownButton';
import { FormErrorSummary } from '@/components/auth/FormErrorSummary';
import { FormField } from '@/components/auth/FormField';
import { useServerProblem, DEFAULT_RETRY_SECONDS } from '@/components/auth/useServerProblem';
import { PageHeader } from '@/components/display/PageHeader';
import { Segmented } from '@/components/display/Segmented';
import { StatusBadge } from '@/components/display/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { useFilterParams } from '@/components/admin/FilterBar';
import { LoadMore, pagesOf, RefreshButton, ShowingCount } from '@/components/admin/ListParts';
import { ResponsiveTable } from '@/components/admin/ResponsiveTable';
import {
  adminErrorMessage,
  emailFailureMessage,
  INVITE_FILTER_OPTIONS,
  INVITES_TEXT,
  isUnknownWriteResult,
  WRITE_UNKNOWN,
} from '@/lib/adminMessages';
import { copyText } from '@/lib/clipboard';
import { formatDateTime } from '@/lib/format';
import { useCountdown } from '@/lib/useCountdown';
import { usePageTitle } from '@/lib/usePageTitle';
import { inviteSchema, normalizePhone } from '@/lib/validation';

/** @typedef {import('@/api/endpoints/admin').Invite} Invite */
/** @typedef {import('@/api/endpoints/admin').InviteSent} InviteSent */
/** @typedef {import('@/components/admin/ConfirmDialog').DialogError} DialogError */

/** Wait after a code was sent before another can be sent (as on the F1 screens). */
export const RESEND_COOLDOWN_SECONDS = 60;

const RULES = Object.freeze({
  status: {
    values: ['all', 'pending', 'used', 'expired', 'revoked', 'locked'],
    fallback: 'all',
  },
});

/** Server field to form field for a 422 on POST /admin/invites. */
const SERVER_FIELDS = Object.freeze({ name: 'name', phone_number: 'phone', email: 'email' });

/** The accept invitation page address. It holds no code and no secret. */
export function acceptInviteAddress() {
  return `${window.location.origin}/accept-invite`;
}

/**
 * "Send invitation": name, phone and email, validated like registration (the phone is sent
 * normalised). A 409 or 422 stays in the dialog; a 429 counts down on the submit button. The
 * dialog has its own trigger button, so focus returns to it when the dialog closes.
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, onSent: (sent: InviteSent) => void }} props
 */
function InviteFormDialog({ open, onOpenChange, onSent }) {
  const create = useCreateInvite();
  const submitting = useRef(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: '', phone: '', email: '' },
  });
  const { problem, summaryRef, showError, clearProblem, countdown } = useServerProblem({
    setError,
    idPrefix: 'invite',
    fieldMap: SERVER_FIELDS,
  });

  /** @param {import('zod').infer<typeof inviteSchema>} values */
  async function onSubmit(values) {
    if (submitting.current) return;
    submitting.current = true;
    clearProblem();
    try {
      const sent = await create.mutateAsync({
        name: values.name.trim(),
        phoneNumber: /** @type {string} */ (normalizePhone(values.phone)),
        email: values.email.trim(),
      });
      reset();
      onSent(sent);
    } catch (error) {
      if (isUnknownWriteResult(error)) showError(error, { text: WRITE_UNKNOWN.list });
      else if (error instanceof ApiError && error.status === 409) {
        showError(error, { text: adminErrorMessage(error) });
      } else showError(error);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (create.isPending) return;
        if (!next) clearProblem();
        onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <MailPlus aria-hidden="true" />
          {INVITES_TEXT.send}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{INVITES_TEXT.formTitle}</DialogTitle>
          <DialogDescription>{INVITES_TEXT.formDescription}</DialogDescription>
        </DialogHeader>
        <FormErrorSummary
          ref={summaryRef}
          problems={problem?.problems ?? []}
          reference={problem?.reference}
        />
        <form
          noValidate
          onSubmit={(event) => handleSubmit(onSubmit)(event)}
          className="flex flex-col gap-4"
        >
          <FormField
            id="invite-name"
            label={INVITES_TEXT.nameLabel}
            autoComplete="off"
            error={errors.name?.message}
            {...register('name')}
          />
          <FormField
            id="invite-phone"
            label={INVITES_TEXT.phoneLabel}
            hint={INVITES_TEXT.phoneHint}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <FormField
            id="invite-email"
            label={INVITES_TEXT.emailLabel}
            hint={INVITES_TEXT.emailHint}
            type="email"
            autoComplete="off"
            error={errors.email?.message}
            {...register('email')}
          />
          <SubmitButton
            pending={create.isPending}
            pendingLabel={INVITES_TEXT.sending}
            remaining={countdown.remaining}
          >
            {INVITES_TEXT.submit}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The result of a new invitation, with the accept invitation page address to share (never the
 * code, which goes only to the person's email).
 * @param {{ sent: InviteSent }} props
 */
function InviteResult({ sent }) {
  const [copyStatus, setCopyStatus] = useState('');
  const address = acceptInviteAddress();
  return (
    <section
      aria-label={INVITES_TEXT.formTitle}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      data-testid="invite-result"
    >
      <p role="status" className="flex items-start gap-2 text-text">
        {sent.email_sent ? (
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-positive" />
        ) : (
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-negative" />
        )}
        <span>
          {sent.email_sent ? INVITES_TEXT.sent(sent.email_masked) : INVITES_TEXT.notEmailed}
        </span>
      </p>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-text-secondary">{INVITES_TEXT.addressLabel}</p>
        <p className="font-mono break-all text-text" data-testid="accept-address">
          {address}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () =>
              setCopyStatus(
                (await copyText(address)) ? INVITES_TEXT.copied : INVITES_TEXT.copyFailed,
              )
            }
          >
            <Copy aria-hidden="true" />
            {INVITES_TEXT.copyAddress}
          </Button>
          <span role="status" className="text-sm text-text-secondary">
            {copyStatus}
          </span>
        </div>
        <p className="text-sm text-text-secondary">{INVITES_TEXT.shareNote}</p>
      </div>
    </section>
  );
}

/**
 * Resend for one pending invitation: 60 seconds of cooldown after a send, and the Retry-After of
 * a 429 resend_cooldown (60 without the header), on the F1 countdown button.
 * @param {{ invite: Invite, onProblem: (message: string) => void }} props
 */
function ResendButton({ invite, onProblem }) {
  const resend = useResendInvite();
  const countdown = useCountdown();
  const sending = useRef(false);

  async function send() {
    if (sending.current) return;
    sending.current = true;
    try {
      const sent = await resend.mutateAsync(invite.id);
      countdown.start(RESEND_COOLDOWN_SECONDS);
      if (sent.email_sent) toast.success(INVITES_TEXT.resent(sent.email_masked));
      else toast.error(INVITES_TEXT.resentNotEmailed);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        countdown.start(
          error.retryAfter && error.retryAfter > 0 ? error.retryAfter : DEFAULT_RETRY_SECONDS,
        );
      }
      onProblem(isUnknownWriteResult(error) ? WRITE_UNKNOWN.list : adminErrorMessage(error));
    } finally {
      sending.current = false;
    }
  }

  return (
    <CountdownButton
      type="button"
      variant="outline"
      size="sm"
      remaining={countdown.remaining}
      pending={resend.isPending}
      pendingLabel={INVITES_TEXT.resending}
      onClick={send}
    >
      <Send aria-hidden="true" />
      <span>{INVITES_TEXT.resend}</span>
      <span className="sr-only">{` ${invite.name}`}</span>
    </CountdownButton>
  );
}

/** "Check email delivery": POST /admin/email/test, with the result in plain words. */
function EmailCheck() {
  const check = useSendTestEmail();
  const [result, setResult] = useState(/** @type {{ ok: boolean, text: string } | null} */ (null));
  const busy = useRef(false);

  async function run() {
    if (busy.current) return;
    busy.current = true;
    setResult(null);
    try {
      const answer = await check.mutateAsync();
      setResult(
        answer.email_sent
          ? { ok: true, text: INVITES_TEXT.emailCheckOk }
          : { ok: false, text: INVITES_TEXT.emailCheckNotSent },
      );
    } catch (error) {
      const text =
        error instanceof ApiError && error.code === 'email_failed'
          ? emailFailureMessage(error)
          : adminErrorMessage(error);
      setResult({ ok: false, text });
    } finally {
      busy.current = false;
    }
  }

  return (
    <section
      aria-labelledby="email-check-title"
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
    >
      <h2 id="email-check-title" className="text-base font-semibold text-text">
        {INVITES_TEXT.emailCheck}
      </h2>
      <p className="text-sm text-text-secondary">{INVITES_TEXT.emailCheckHint}</p>
      <CountdownButton
        type="button"
        variant="outline"
        className="w-full sm:w-fit"
        remaining={0}
        pending={check.isPending}
        pendingLabel={INVITES_TEXT.emailChecking}
        onClick={run}
      >
        <Mail aria-hidden="true" />
        {INVITES_TEXT.emailCheck}
      </CountdownButton>
      <div role="status" className="empty:hidden">
        {result && (
          <p className="flex items-start gap-2 text-sm text-text" data-testid="email-check-result">
            {result.ok ? (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-positive" />
            ) : (
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
            )}
            <span>{result.text}</span>
          </p>
        )}
      </div>
    </section>
  );
}

/** @type {ReadonlyArray<import('@/components/admin/ResponsiveTable').Column<Invite>>} */
const COLUMNS = [
  { key: 'name', header: INVITES_TEXT.name, cell: (i) => i.name },
  { key: 'email', header: INVITES_TEXT.email, cell: (i) => i.email_masked },
  {
    key: 'status',
    header: INVITES_TEXT.status,
    wrap: true,
    cell: (i) => (
      <span className="flex flex-col gap-1">
        <StatusBadge kind="invite" status={i.status} />
        {i.status === 'used' && i.used_at && (
          <span className="text-sm text-text-secondary">
            {INVITES_TEXT.usedAt(formatDateTime(i.used_at))}
          </span>
        )}
        {i.status === 'revoked' && i.revoked_at && (
          <span className="text-sm text-text-secondary">
            {INVITES_TEXT.revokedAt(formatDateTime(i.revoked_at))}
          </span>
        )}
        {i.status === 'locked' && (
          <span className="flex items-start gap-1 text-sm text-text-secondary">
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{INVITES_TEXT.locked}</span>
          </span>
        )}
      </span>
    ),
  },
  { key: 'createdBy', header: INVITES_TEXT.createdBy, cell: (i) => i.created_by_name ?? '—' },
  { key: 'created', header: INVITES_TEXT.created, cell: (i) => formatDateTime(i.created_at) },
  { key: 'expires', header: INVITES_TEXT.expires, cell: (i) => formatDateTime(i.expires_at) },
  { key: 'sent', header: INVITES_TEXT.sendCount, numeric: true, cell: (i) => String(i.send_count) },
  {
    key: 'attempts',
    header: INVITES_TEXT.attempts,
    numeric: true,
    cell: (i) => String(i.attempts),
  },
];

/**
 * Invites (/admin/invites, main administrator only): send an invitation, the list of
 * invitations by status with Resend (pending) and Revoke (pending, and locked as its message
 * advises), and "Check email delivery". No code, password or token is ever shown or asked for
 * here: the code goes only to the invited person's email.
 */
export default function InvitesScreen() {
  const headingRef = usePageTitle(INVITES_TEXT.title);
  const client = useQueryClient();
  const filters = useFilterParams(RULES);
  const status = filters.values.status;
  const query = useAdminInvites({
    status:
      status === 'all'
        ? null
        : /** @type {import('@/api/endpoints/admin').InviteStatus} */ (status),
  });
  const revoke = useRevokeInvite();
  const [formOpen, setFormOpen] = useState(false);
  const [sent, setSent] = useState(/** @type {InviteSent | null} */ (null));
  const [revoking, setRevoking] = useState(/** @type {Invite | null} */ (null));
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeError, setRevokeError] = useState(/** @type {DialogError | null} */ (null));
  const opener = useRef(/** @type {HTMLElement | null} */ (null));

  /** @param {string} message */
  function showRowProblem(message) {
    toast.error(message);
    void client.invalidateQueries({ queryKey: queryKeys.adminInvitesRoot() });
  }

  /** @param {Invite} invite */
  function askRevoke(invite) {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
    setRevoking(invite);
    setRevokeError(null);
    setRevokeOpen(true);
  }

  async function runRevoke() {
    if (!revoking) return;
    try {
      await revoke.mutateAsync(revoking.id);
      setRevokeOpen(false);
      toast.success(INVITES_TEXT.revoked);
    } catch (error) {
      if (isUnknownWriteResult(error)) {
        setRevokeError({ message: WRITE_UNKNOWN.list, final: true });
        return;
      }
      setRevokeError({
        message: adminErrorMessage(error),
        reference: error instanceof ApiError ? error.requestId : null,
        final: error instanceof ApiError && error.status >= 400 && error.status < 500,
      });
      void client.invalidateQueries({ queryKey: queryKeys.adminInvitesRoot() });
    }
  }

  const { items, total } = pagesOf(query.data);
  let body;
  if (query.isPending) {
    body = <LoadingState label={INVITES_TEXT.loading} rows={3} />;
  } else if (query.isError && !query.isFetchNextPageError) {
    body = (
      <ErrorState
        error={query.error}
        title={INVITES_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={MailPlus}
        title={filters.active ? INVITES_TEXT.emptyFilteredTitle : INVITES_TEXT.emptyTitle}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ShowingCount shown={items.length} total={total} />
        <ResponsiveTable
          caption={INVITES_TEXT.caption}
          captionHidden
          columns={COLUMNS}
          rows={items}
          rowKey={(i) => i.id}
          actions={(invite) =>
            invite.status === 'pending' || invite.status === 'locked' ? (
              <>
                {invite.status === 'pending' && (
                  <ResendButton invite={invite} onProblem={showRowProblem} />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${INVITES_TEXT.revoke} ${invite.name}`}
                  onClick={() => askRevoke(invite)}
                  disabled={revoke.isPending}
                >
                  <Trash2 aria-hidden="true" />
                  {INVITES_TEXT.revoke}
                </Button>
              </>
            ) : null
          }
        />
        <LoadMore query={query} errorTitle={INVITES_TEXT.errorTitle} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={INVITES_TEXT.title}
        description={INVITES_TEXT.description}
        headingRef={headingRef}
        actions={
          <>
            <InviteFormDialog
              open={formOpen}
              onOpenChange={(next) => {
                if (next) setSent(null);
                setFormOpen(next);
              }}
              onSent={(result) => {
                setSent(result);
                setFormOpen(false);
              }}
            />
            <RefreshButton
              onRefresh={() => query.refetch()}
              refreshing={query.isRefetching && !query.isFetchingNextPage}
              disabled={query.isPending}
            />
          </>
        }
      />
      {sent && <InviteResult sent={sent} />}
      <EmailCheck />
      <Segmented
        legend={INVITES_TEXT.statusLegend}
        name="admin-invite-status"
        options={INVITE_FILTER_OPTIONS}
        value={/** @type {any} */ (status)}
        onChange={(value) => filters.set({ status: value })}
      />
      {body}
      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title={revoking ? INVITES_TEXT.revokeTitle(revoking.name) : ''}
        description={INVITES_TEXT.revokeBody}
        confirmLabel={INVITES_TEXT.revokeConfirm}
        pendingLabel={INVITES_TEXT.revoking}
        destructive
        pending={revoke.isPending}
        onConfirm={runRevoke}
        error={revokeError}
        returnFocus={() => (opener.current?.isConnected ? opener.current : headingRef.current)}
      />
    </div>
  );
}
