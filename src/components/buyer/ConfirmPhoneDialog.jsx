import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { formatKES } from '@/lib/format';
import { formatPhoneLocal, normalizePhone } from '@/lib/phone';
import { ORDER_SCREEN_TEXT } from '@/lib/buyerMessages';

/**
 * "Send the payment prompt?": the last check before POST /orders/{id}/pay. It shows the
 * server's total and the number the buyer typed, in full and in the local format, so a typing
 * mistake can be caught (every later display uses the server's masked value). Built on the
 * shared ConfirmDialog (focus trap, focus return). While the request is in flight "Send prompt"
 * shows a spinner and is disabled, "Change number" is disabled and Escape does not close it; a
 * polite status region inside the dialog says "Sending request" once.
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   phone: string,
 *   totalAmount: number | string,
 *   pending: boolean,
 *   onSend: () => void,
 *   returnFocus?: () => HTMLElement | null | undefined,
 * }} props
 */
export function ConfirmPhoneDialog({
  open,
  onOpenChange,
  phone,
  totalAmount,
  pending,
  onSend,
  returnFocus,
}) {
  const local = formatPhoneLocal(normalizePhone(phone.trim())) ?? '';
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={ORDER_SCREEN_TEXT.confirmTitle}
      description={ORDER_SCREEN_TEXT.confirmText(formatKES(totalAmount), local)}
      confirmLabel={ORDER_SCREEN_TEXT.sendPrompt}
      cancelLabel={ORDER_SCREEN_TEXT.changeNumber}
      pending={pending}
      pendingLabel={ORDER_SCREEN_TEXT.sending}
      onConfirm={onSend}
      returnFocus={returnFocus}
    >
      <p>{ORDER_SCREEN_TEXT.confirmOwn}</p>
      <p role="status" aria-live="polite" className="sr-only" data-testid="send-status">
        {pending ? ORDER_SCREEN_TEXT.sending : ''}
      </p>
    </ConfirmDialog>
  );
}
