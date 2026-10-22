import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { ConfirmDialog as BaseConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Label } from '@/components/ui/label';
import { ADMIN_COMMON, NOTE_TEXT } from '@/lib/adminMessages';
import { cn } from '@/lib/utils';

/**
 * @typedef {object} DialogError
 * @property {string} message
 * @property {string | null} [reference]  the request id
 * @property {boolean} [final]  retrying cannot help: hide the confirm button, Cancel reads Close
 * @property {import('react').ReactNode} [action]  for example a Refresh button
 */

/**
 * @typedef {object} NoteOptions  a required note typed in the dialog
 * @property {string} label
 * @property {string} hint
 * @property {number} min  shortest note after trimming
 * @property {number} max
 */

/**
 * A confirmation for an action that changes a user, listing, invitation or order (F4). Built on
 * the shared dialog: focus is trapped inside while it is open and returns to the button that
 * opened it. It adds the consequences as a list, an optional required note with a character
 * counter, a spinner on the confirm button, the error of a failed attempt (the dialog stays
 * open), and a guard so a double click sends one request.
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   title: string,
 *   description: string,
 *   consequences?: string[],
 *   confirmLabel: string,
 *   pendingLabel?: string,
 *   destructive?: boolean,
 *   pending?: boolean,
 *   onConfirm: (note: string) => Promise<unknown> | void,
 *   error?: DialogError | null,
 *   note?: NoteOptions,
 *   returnFocus?: () => HTMLElement | null | undefined,
 * }} props
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences = [],
  confirmLabel,
  pendingLabel,
  destructive = false,
  pending = false,
  onConfirm,
  error = null,
  note,
  returnFocus,
}) {
  const ids = useId();
  const noteId = `${ids}-note`;
  const [noteText, setNoteText] = useState('');
  const [noteTouched, setNoteTouched] = useState(false);
  const busy = useRef(false);
  const noteRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null));

  // A dialog opened again starts with an empty note.
  const [openedFor, setOpenedFor] = useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setNoteText('');
      setNoteTouched(false);
    }
  }

  useEffect(() => {
    if (!open) busy.current = false;
  }, [open]);

  const trimmed = noteText.trim();
  let noteProblem = null;
  if (note && trimmed.length < note.min) noteProblem = NOTE_TEXT.tooShort(note.min);
  else if (note && trimmed.length > note.max) noteProblem = NOTE_TEXT.tooLong(note.max);
  const showNoteProblem = Boolean(note && noteTouched && noteProblem);

  async function confirm() {
    if (busy.current || pending) return;
    if (note && noteProblem) {
      setNoteTouched(true);
      noteRef.current?.focus();
      return;
    }
    busy.current = true;
    try {
      await onConfirm(trimmed);
    } finally {
      busy.current = false;
    }
  }

  const final = Boolean(error?.final);
  return (
    <BaseConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={final ? ADMIN_COMMON.close : ADMIN_COMMON.cancel}
      pendingLabel={pendingLabel}
      destructive={destructive}
      pending={pending}
      hideConfirm={final}
      onConfirm={confirm}
      returnFocus={returnFocus}
    >
      {consequences.length > 0 && (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-base text-text">
          {consequences.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {note && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={noteId}>{note.label}</Label>
          <textarea
            ref={noteRef}
            id={noteId}
            rows={4}
            maxLength={note.max}
            value={noteText}
            disabled={pending}
            onChange={(event) => setNoteText(event.target.value)}
            onBlur={() => setNoteTouched(true)}
            aria-invalid={showNoteProblem ? true : undefined}
            aria-describedby={cn(
              `${noteId}-hint`,
              `${noteId}-counter`,
              showNoteProblem && `${noteId}-error`,
            )}
            className="min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-base text-text outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          />
          <p id={`${noteId}-hint`} className="text-sm text-text-secondary">
            {note.hint}
          </p>
          <p id={`${noteId}-counter`} className="text-sm text-text-secondary tabular-nums">
            {NOTE_TEXT.counter(noteText.length, note.max)}
          </p>
          {showNoteProblem && (
            <p
              id={`${noteId}-error`}
              className="flex items-start gap-1.5 text-sm font-medium text-negative-text"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
              <span>{noteProblem}</span>
            </p>
          )}
        </div>
      )}
      <div role="alert" className="empty:hidden">
        {error && (
          <div
            className="flex flex-col gap-2 rounded-lg border border-negative bg-card px-4 py-3 text-sm"
            data-testid="dialog-error"
          >
            <p className="flex items-start gap-2 font-medium text-negative-text">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
              <span>{error.message}</span>
            </p>
            {error.reference && (
              <p className="text-text-secondary">
                Reference: <span className="font-mono break-all">{error.reference}</span>
              </p>
            )}
            {error.action}
          </div>
        )}
      </div>
    </BaseConfirmDialog>
  );
}
