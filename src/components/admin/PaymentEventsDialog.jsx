import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { usePaymentEvents } from '@/api/queries/admin';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { formatDateTime } from '@/lib/format';
import { ADMIN_COMMON, EVENTS_TEXT } from '@/lib/adminMessages';
import { PayloadView } from './PayloadView';

/**
 * The events of one payment, fetched when the dialog opens.
 * @param {{ paymentId: string }} props
 */
function EventList({ paymentId }) {
  const query = usePaymentEvents(paymentId, true);
  if (query.isPending) return <LoadingState label={EVENTS_TEXT.loading} rows={2} />;
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        title={EVENTS_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  }
  const events = query.data.items;
  if (events.length === 0) return <EmptyState icon={ScrollText} title={EVENTS_TEXT.empty} />;
  return (
    <ol className="flex flex-col gap-4">
      {events.map((event, index) => (
        <li
          key={event.id}
          className="flex flex-col gap-2 rounded-lg border border-border p-3"
          data-event-id={event.id}
        >
          <h3 className="font-mono text-base font-semibold break-all text-text">
            {event.event_type}
          </h3>
          <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
            <dt className="text-text-secondary">{EVENTS_TEXT.time}</dt>
            <dd className="text-text">{formatDateTime(event.created_at)}</dd>
            <dt className="text-text-secondary">{EVENTS_TEXT.checkoutId}</dt>
            <dd className="font-mono break-all text-text">
              {event.checkout_request_id ?? EVENTS_TEXT.noCheckoutId}
            </dd>
          </dl>
          <PayloadView
            payload={event.payload}
            label={`${EVENTS_TEXT.payload} ${index + 1}: ${event.event_type}`}
          />
        </li>
      ))}
    </ol>
  );
}

/**
 * "View events" for one payment: a dialog that loads GET /admin/payments/{id}/events only when
 * it opens, and lists each event's type, time, checkout request id and payload (as text).
 * Focus returns to the button when the dialog closes.
 * @param {{ paymentId: string, label?: string }} props  label: extra words for screen readers
 */
export function PaymentEventsDialog({ paymentId, label }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={label ? `${ADMIN_COMMON.viewEvents} ${label}` : undefined}
        >
          <ScrollText aria-hidden="true" />
          {ADMIN_COMMON.viewEvents}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{EVENTS_TEXT.title}</DialogTitle>
          <DialogDescription>{EVENTS_TEXT.description}</DialogDescription>
        </DialogHeader>
        {open && <EventList paymentId={paymentId} />}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {EVENTS_TEXT.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
