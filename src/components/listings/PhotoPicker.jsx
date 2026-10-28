import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Camera, ImagePlus, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/format';
import { imageErrorMessage, PHOTO_TEXT } from '@/lib/messages';
import { safeImageUrl } from '@/lib/safeImageUrl';

/**
 * The photo part of the listing form.
 * - `none`: no new photo. With `removeCurrent`, the current photo is removed on save.
 * - `preparing`: a chosen photo is being resized; `pending` settles with the file or null.
 * - `ready`: `file` is a JPEG named photo.jpg, ready to upload.
 * - `error`: preparation failed with `errorCode` (an ImageError code).
 * @typedef {{
 *   status: 'none' | 'preparing' | 'ready' | 'error',
 *   file: File | null,
 *   bytes: number | null,
 *   errorCode: string | null,
 *   removeCurrent: boolean,
 *   pending: Promise<File | null> | null,
 * }} PhotoValue
 */

/** @type {PhotoValue} */
export const EMPTY_PHOTO = Object.freeze({
  status: 'none',
  file: null,
  bytes: null,
  errorCode: null,
  removeCurrent: false,
  pending: null,
});

const ACCEPT = 'image/jpeg,image/png';

/**
 * Take or choose a photo, prepare it in the browser (lib/image.js, loaded on demand), preview
 * it, and report the result. Screen readers hear "Preparing photo" and "Photo ready, 240 kB".
 * @param {{
 *   value: PhotoValue,
 *   onChange: (value: PhotoValue) => void,
 *   currentUrl?: string | null,
 *   currentAlt?: string,
 *   serverError?: string | null,
 *   disabled?: boolean,
 * }} props
 */
export function PhotoPicker({
  value,
  onChange,
  currentUrl = null,
  currentAlt = PHOTO_TEXT.current,
  serverError = null,
  disabled = false,
}) {
  const id = useId();
  const cameraRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const galleryRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const removeRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const galleryButtonRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  // Each pick gets a number; a slower earlier preparation never overwrites a later pick.
  const pickRef = useRef(0);
  const [previewUrl, setPreviewUrl] = useState(/** @type {string | null} */ (null));
  const [announcement, setAnnouncement] = useState('');

  // Revoke the preview's object URL when it is replaced and on unmount.
  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // A stale preparation must not report after unmount.
  useEffect(
    () => () => {
      pickRef.current += 1;
    },
    [],
  );

  /** @param {import('react').ChangeEvent<HTMLInputElement>} event */
  async function handleFile(event) {
    const input = event.currentTarget;
    const chosen = input.files?.[0];
    // Let the same file be chosen again later.
    input.value = '';
    if (!chosen) return;
    const pick = ++pickRef.current;
    setPreviewUrl(null);
    setAnnouncement(PHOTO_TEXT.preparing);

    /** @type {(file: File | null) => void} */
    let settle = () => {};
    const pending = new Promise((resolve) => {
      settle = resolve;
    });
    onChange({ ...EMPTY_PHOTO, removeCurrent: value.removeCurrent, status: 'preparing', pending });

    try {
      const { prepareImage } = await import('@/lib/image');
      const prepared = await prepareImage(chosen);
      if (pick !== pickRef.current) return settle(null);
      setPreviewUrl(URL.createObjectURL(prepared.blob));
      setAnnouncement(PHOTO_TEXT.ready(formatBytes(prepared.bytes)));
      onChange({
        ...EMPTY_PHOTO,
        removeCurrent: value.removeCurrent,
        status: 'ready',
        file: prepared.blob,
        bytes: prepared.bytes,
      });
      settle(prepared.blob);
    } catch (error) {
      if (pick !== pickRef.current) return settle(null);
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'decode_failed';
      setAnnouncement('');
      onChange({
        ...EMPTY_PHOTO,
        removeCurrent: value.removeCurrent,
        status: 'error',
        errorCode: code,
      });
      settle(null);
    }
    return undefined;
  }

  function removeNew() {
    pickRef.current += 1;
    setPreviewUrl(null);
    setAnnouncement(PHOTO_TEXT.removed);
    onChange({ ...EMPTY_PHOTO, removeCurrent: value.removeCurrent });
    galleryButtonRef.current?.focus();
  }

  function removeCurrent() {
    setAnnouncement(PHOTO_TEXT.willRemove);
    onChange({ ...value, removeCurrent: true });
    galleryButtonRef.current?.focus();
  }

  function keepCurrent() {
    setAnnouncement('');
    onChange({ ...value, removeCurrent: false });
    removeRef.current?.focus();
  }

  const safeCurrent = safeImageUrl(currentUrl);
  const hasNew = value.status === 'ready' && previewUrl;
  const showCurrent = Boolean(safeCurrent) && !value.removeCurrent && value.status !== 'ready';
  const errorText = value.status === 'error' ? imageErrorMessage(value.errorCode) : serverError;
  const errorId = `${id}-error`;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1.5 text-sm font-medium text-text">{PHOTO_TEXT.legend}</legend>

      {hasNew && (
        <img
          src={previewUrl}
          alt={PHOTO_TEXT.previewAlt}
          className="aspect-[4/3] w-full max-w-sm rounded-lg bg-neutral-bg object-cover"
        />
      )}
      {showCurrent && safeCurrent && (
        <img
          src={safeCurrent}
          alt={currentAlt}
          decoding="async"
          className="aspect-[4/3] w-full max-w-sm rounded-lg bg-neutral-bg object-cover"
        />
      )}
      {value.removeCurrent && value.status !== 'ready' && (
        <p className="text-sm text-text-secondary">{PHOTO_TEXT.willRemove}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera aria-hidden="true" />
          {PHOTO_TEXT.takePhoto}
        </Button>
        <Button
          ref={galleryButtonRef}
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => galleryRef.current?.click()}
        >
          <ImagePlus aria-hidden="true" />
          {PHOTO_TEXT.chooseGallery}
        </Button>
        {hasNew && (
          <Button
            ref={removeRef}
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={removeNew}
          >
            <Trash2 aria-hidden="true" />
            {PHOTO_TEXT.removePhoto}
          </Button>
        )}
        {showCurrent && (
          <Button
            ref={removeRef}
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={removeCurrent}
          >
            <Trash2 aria-hidden="true" />
            {PHOTO_TEXT.removePhoto}
          </Button>
        )}
        {value.removeCurrent && value.status !== 'ready' && (
          <Button type="button" variant="ghost" disabled={disabled} onClick={keepCurrent}>
            <Undo2 aria-hidden="true" />
            {PHOTO_TEXT.undoRemove}
          </Button>
        )}
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        hidden
        tabIndex={-1}
        aria-label={PHOTO_TEXT.takePhoto}
        data-testid="photo-camera-input"
        onChange={handleFile}
      />
      <input
        ref={galleryRef}
        type="file"
        accept={ACCEPT}
        hidden
        tabIndex={-1}
        aria-label={PHOTO_TEXT.chooseGallery}
        data-testid="photo-gallery-input"
        onChange={handleFile}
      />

      <p role="status" aria-live="polite" className="text-sm text-text" data-testid="photo-status">
        {announcement}
      </p>
      {errorText && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-sm font-medium text-negative-text"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
          <span data-testid="photo-error">{errorText}</span>
        </p>
      )}
    </fieldset>
  );
}
