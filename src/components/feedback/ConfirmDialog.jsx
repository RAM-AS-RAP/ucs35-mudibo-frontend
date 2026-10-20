import { useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * A confirmation in the shadcn dialog: focus moves into the dialog when it opens and, when it
 * closes, to the element `returnFocus` returns (for example the button that opened it, or the
 * page heading when that button is gone because its card was removed). Without `returnFocus`, or
 * when that element is gone, focus returns to the element that had it when the dialog opened
 * (Radix only restores focus to a DialogTrigger, and these dialogs are opened from state).
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   title: string,
 *   description: string,
 *   confirmLabel: string,
 *   cancelLabel: string,
 *   onConfirm?: () => void,
 *   pending?: boolean,
 *   pendingLabel?: string,
 *   destructive?: boolean,
 *   hideConfirm?: boolean,
 *   children?: import('react').ReactNode,
 *   returnFocus?: () => HTMLElement | null | undefined,
 * }} props
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  pending = false,
  pendingLabel,
  destructive = false,
  hideConfirm = false,
  children,
  returnFocus,
}) {
  const openedFrom = useRef(/** @type {HTMLElement | null} */ (null));
  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={() => {
          const active = document.activeElement;
          openedFrom.current = active instanceof HTMLElement ? active : null;
        }}
        onCloseAutoFocus={(event) => {
          const wanted = returnFocus?.();
          const target = wanted && wanted.isConnected ? wanted : openedFrom.current;
          openedFrom.current = null;
          if (target && target.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-base text-text">{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          {!hideConfirm && (
            <Button
              type="button"
              variant={destructive ? 'destructive' : 'default'}
              disabled={pending}
              onClick={onConfirm}
            >
              {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
              {pending && pendingLabel ? pendingLabel : confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
