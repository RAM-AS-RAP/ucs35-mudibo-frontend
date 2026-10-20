import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker } from 'react-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { ApiError, getUserMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describedBy, FieldError, FieldHint } from '@/components/auth/FormField';
import { FormErrorSummary } from '@/components/auth/FormErrorSummary';
import { OfflineFormNotice } from '@/components/auth/FormNotices';
import { useServerProblem } from '@/components/auth/useServerProblem';
import { Segmented } from '@/components/display/Segmented';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { useIsOffline } from '@/lib/connectivity';
import { multiplyMoney, parseDecimalInput, sameDecimal } from '@/lib/decimal';
import { formatKES, formatQuantity } from '@/lib/format';
import { cropLabel, imageErrorMessage, LISTING_TEXT, MESSAGES } from '@/lib/messages';
import { checkAskingPrice, comparisonWords } from '@/lib/priceCheck';
import { cn } from '@/lib/utils';
import { EMPTY_PHOTO, PhotoPicker } from './PhotoPicker';
import { PriceGuidance } from './PriceGuidance';
import { useLatestPrice } from './useLatestPrice';

/** @typedef {import('@/api/endpoints/listings').Listing} Listing */
/** @typedef {import('@/api/endpoints/listings').NewListingFields} NewListingFields */
/** @typedef {import('@/api/endpoints/listings').ListingChanges} ListingChanges */
/** @typedef {import('./PhotoPicker').PhotoValue} PhotoValue */
/** @typedef {{ crop: 'maize' | 'beans', market: string, quantity: string, price: string }} FormValues */

/** Quantity and price per kg: greater than 0 (quantity may be 0 on edit), at most 100 000. */
export const MAX_QUANTITY = 100_000;
export const MAX_PRICE = 100_000;

const ID = 'listing';
const CROP_OPTIONS = /** @type {const} */ (['maize', 'beans']).map((value) => ({
  value,
  label: cropLabel(value),
}));
const SERVER_FIELDS = {
  crop: 'crop',
  market: 'market',
  quantity_available: 'quantity',
  price_per_unit: 'price',
};
const PHOTO_CODES = new Set(['invalid_image', 'image_too_large', 'payload_too_large']);
const UNCERTAIN_CODES = new Set(['timeout', 'network_error']);

/** @param {string} text @param {boolean} allowZero */
const parseQuantity = (text, allowZero) =>
  parseDecimalInput(text, { max: MAX_QUANTITY, allowZero });
/** @param {string} text */
const parsePrice = (text) => parseDecimalInput(text, { max: MAX_PRICE });

/**
 * The listing form shared by the create and edit screens.
 *
 * Create sends crop, market, quantity, price and an optional photo. Edit shows the crop and
 * market read only and sends only the fields that changed. Both check the asking price against
 * the latest market price, show an estimate, prepare the photo in the browser, never submit
 * twice, never retry a write, and warn before leaving with unsaved changes.
 *
 * `onSubmit` receives the create fields or the edit changes. It throws ApiError on failure;
 * codes the screen handles itself (for example listing_removed) it handles and returns.
 * @param {{
 *   mode: 'create' | 'edit',
 *   initial: FormValues,
 *   markets?: string[],
 *   listing?: Listing | null,
 *   disabled?: boolean,
 *   onSubmit: (payload: NewListingFields | ListingChanges) => Promise<void>,
 * }} props
 */
export function ListingForm({ mode, initial, markets = [], listing = null, disabled, onSubmit }) {
  const isEdit = mode === 'edit';
  const offline = useIsOffline();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm({ defaultValues: initial, mode: 'onTouched' });
  const { problem, summaryRef, showError, clearProblem, countdown } = useServerProblem({
    setError,
    idPrefix: ID,
    fieldMap: SERVER_FIELDS,
  });

  const [photo, setPhoto] = useState(/** @type {PhotoValue} */ (EMPTY_PHOTO));
  const [photoServerError, setPhotoServerError] = useState(/** @type {string | null} */ (null));
  const [phase, setPhase] = useState(/** @type {null | 'photo' | 'saving'} */ (null));
  const [uncertain, setUncertain] = useState(false);
  const [confirmedFor, setConfirmedFor] = useState(/** @type {string | null} */ (null));
  const [zeroOpen, setZeroOpen] = useState(false);
  const inFlight = useRef(false);
  const allowLeave = useRef(false);
  const zeroValues = useRef(/** @type {FormValues | null} */ (null));

  const crop = useWatch({ control, name: 'crop' });
  const market = useWatch({ control, name: 'market' }) || null;
  const quantityText = useWatch({ control, name: 'quantity' }) ?? '';
  const priceText = useWatch({ control, name: 'price' }) ?? '';
  const quantity = parseQuantity(quantityText, isEdit);
  const price = parsePrice(priceText);

  // What would change on save (edit). An invalid entry counts as a change so that submitting
  // shows its error.
  const quantityChanged =
    isEdit && listing
      ? !quantity.ok || !sameDecimal(quantity.value, listing.quantity_available)
      : true;
  const priceChanged =
    isEdit && listing ? !price.ok || !sameDecimal(price.value, listing.price_per_unit) : true;
  const photoChanged = photo.status !== 'none' || photo.removeCurrent;
  const hasChanges = !isEdit || quantityChanged || priceChanged || photoChanged;
  const dirty = isEdit ? quantityChanged || priceChanged || photoChanged : isDirty || photoChanged;
  const pending = phase !== null;

  const { price: latestPrice } = useLatestPrice(crop, market);
  const check = checkAskingPrice(price.ok ? price.value : null, latestPrice);
  const confirmNeeded = check.level === 'confirm' && (!isEdit || priceChanged);
  const confirmed = !confirmNeeded || confirmedFor === priceText;

  // Unsaved changes: the router's blocker for in app navigation, beforeunload for the tab.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !allowLeave.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (!dirty || pending) return undefined;
    /** @param {BeforeUnloadEvent} event */
    const warn = (event) => {
      event.preventDefault();
      // Older browsers show the prompt only when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);

  /** @param {unknown} error */
  function handleError(error) {
    if (error instanceof ApiError && UNCERTAIN_CODES.has(error.code)) {
      setUncertain(true);
      showError(error, {
        text: isEdit ? LISTING_TEXT.uncertainEdit : LISTING_TEXT.uncertainCreate,
      });
      return;
    }
    if (error instanceof ApiError && PHOTO_CODES.has(error.code)) {
      setPhotoServerError(getUserMessage(error));
      showError(error);
      return;
    }
    if (error instanceof ApiError && error.code === 'market_not_available') {
      setError('market', { type: 'server', message: LISTING_TEXT.marketUnavailable });
      showError(error, { text: LISTING_TEXT.marketUnavailable, fieldId: `${ID}-market` });
      return;
    }
    showError(error);
  }

  /** @param {FormValues} values */
  async function send(values) {
    if (inFlight.current) return;
    inFlight.current = true;
    clearProblem();
    setUncertain(false);
    setPhotoServerError(null);
    try {
      /** @type {File | null} */
      let file = null;
      if (photo.status === 'preparing' && photo.pending) {
        setPhase('photo');
        file = await photo.pending;
        // The picker shows why the photo could not be prepared.
        if (!file) return;
      } else if (photo.status === 'ready') {
        file = photo.file;
      } else if (photo.status === 'error') {
        showError(null, { text: imageErrorMessage(photo.errorCode) });
        return;
      }
      const q = parseQuantity(values.quantity, isEdit);
      const p = parsePrice(values.price);
      if (!q.ok || !p.ok) return;

      /** @type {NewListingFields | ListingChanges} */
      let payload;
      if (isEdit && listing) {
        /** @type {ListingChanges} */
        const changes = {};
        if (!sameDecimal(q.value, listing.quantity_available)) changes.quantity_available = q.value;
        if (!sameDecimal(p.value, listing.price_per_unit)) changes.price_per_unit = p.value;
        if (file) changes.image = file;
        else if (photo.removeCurrent) changes.remove_image = true;
        payload = changes;
      } else {
        payload = {
          crop: values.crop,
          market: values.market,
          quantity_available: q.value,
          price_per_unit: p.value,
          ...(file ? { image: file } : {}),
        };
      }
      setPhase('saving');
      allowLeave.current = true;
      await onSubmit(payload);
    } catch (error) {
      allowLeave.current = false;
      handleError(error);
    } finally {
      inFlight.current = false;
      setPhase(null);
    }
  }

  /** @param {FormValues} values */
  function onValid(values) {
    if (pending || inFlight.current || !confirmed || !hasChanges) return undefined;
    const q = parseQuantity(values.quantity, isEdit);
    const becomesSoldOut =
      isEdit && listing && q.ok && q.value === '0' && !sameDecimal(listing.quantity_available, 0);
    if (becomesSoldOut) {
      zeroValues.current = values;
      setZeroOpen(true);
      return undefined;
    }
    return send(values);
  }

  const estimate = quantity.ok && price.ok ? multiplyMoney(quantity.value, price.value) : null;
  const reactivates =
    isEdit && listing?.status === 'sold_out' && quantity.ok && quantity.value !== '0';
  const formDisabled = Boolean(disabled);
  const submitDisabled =
    formDisabled || pending || offline || countdown.active || !confirmed || !hasChanges;

  let submitLabel = isEdit ? LISTING_TEXT.submitEdit : LISTING_TEXT.submitCreate;
  if (countdown.active) submitLabel = MESSAGES.form.tryAgainIn(countdown.remaining);
  else if (phase === 'photo') submitLabel = LISTING_TEXT.preparingPhoto;
  else if (phase === 'saving') submitLabel = LISTING_TEXT.saving;

  const quantityId = `${ID}-quantity`;
  const priceId = `${ID}-price`;
  const marketId = `${ID}-market`;
  const priceCheckId = `${ID}-price-check`;
  const priceSuffixId = `${ID}-price-suffix`;
  const reactivateId = `${ID}-reactivate`;

  return (
    <div className="flex flex-col gap-5">
      <FormErrorSummary
        ref={summaryRef}
        title={LISTING_TEXT.summaryTitle}
        problems={problem?.problems ?? []}
        reference={problem?.reference}
      >
        {uncertain && (
          <Button asChild variant="outline" className="w-fit">
            <Link to="/farmer/listings">{LISTING_TEXT.goToMyListings}</Link>
          </Button>
        )}
      </FormErrorSummary>
      <OfflineFormNotice offline={offline} />

      <form
        noValidate
        onSubmit={(event) => handleSubmit(onValid)(event)}
        className="flex flex-col gap-5"
        aria-label={isEdit ? LISTING_TEXT.editTitle : LISTING_TEXT.newListing}
      >
        {isEdit && listing ? (
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-neutral-bg p-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-text-secondary">{LISTING_TEXT.cropLegend}</dt>
              <dd className="font-semibold text-text">{cropLabel(listing.crop)}</dd>
              <dt className="text-text-secondary">{LISTING_TEXT.marketLabel}</dt>
              <dd className="font-semibold text-text">{listing.market}</dd>
            </dl>
            <p className="text-sm text-neutral-text">{LISTING_TEXT.readOnlyCropMarket}</p>
          </div>
        ) : (
          <>
            <Controller
              control={control}
              name="crop"
              render={({ field }) => (
                <Segmented
                  legend={LISTING_TEXT.cropLegend}
                  name={`${ID}-crop`}
                  options={CROP_OPTIONS}
                  value={field.value}
                  onChange={(value) => field.onChange(value)}
                />
              )}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={marketId}>{LISTING_TEXT.marketLabel}</Label>
              <select
                id={marketId}
                disabled={formDisabled}
                aria-invalid={errors.market ? true : undefined}
                aria-describedby={describedBy(marketId, { error: Boolean(errors.market) })}
                className="flex min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base text-text outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-negative sm:max-w-sm"
                {...register('market', {
                  validate: (value) => Boolean(value) || LISTING_TEXT.marketPlaceholder + '.',
                })}
              >
                <option value="">{LISTING_TEXT.marketPlaceholder}</option>
                {markets.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <FieldError id={marketId} message={errors.market?.message} />
            </div>
          </>
        )}

        <PriceGuidance crop={crop} market={market} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={quantityId}>{LISTING_TEXT.quantityLabel}</Label>
          <Input
            id={quantityId}
            inputMode="decimal"
            autoComplete="off"
            disabled={formDisabled}
            className="sm:max-w-sm"
            aria-invalid={errors.quantity ? true : undefined}
            aria-describedby={describedBy(quantityId, {
              hint: true,
              error: Boolean(errors.quantity),
              extra: reactivates ? [reactivateId] : [],
            })}
            {...register('quantity', {
              validate: (value) => {
                const result = parseQuantity(value, isEdit);
                return result.ok || result.error;
              },
            })}
          />
          <FieldHint id={quantityId}>
            {isEdit ? LISTING_TEXT.quantityEditHint : LISTING_TEXT.quantityHint}
          </FieldHint>
          {reactivates && (
            <p id={reactivateId} className="flex items-start gap-1.5 text-sm text-text">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{LISTING_TEXT.reactivateHint}</span>
            </p>
          )}
          <FieldError id={quantityId} message={errors.quantity?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={priceId}>{LISTING_TEXT.priceLabel}</Label>
          <div className="flex items-center gap-2 sm:max-w-sm">
            <Input
              id={priceId}
              inputMode="decimal"
              autoComplete="off"
              disabled={formDisabled}
              aria-invalid={errors.price ? true : undefined}
              aria-describedby={describedBy(priceId, {
                hint: true,
                error: Boolean(errors.price),
                extra: [priceSuffixId, ...(check.level !== 'ok' ? [priceCheckId] : [])],
              })}
              {...register('price', {
                validate: (value) => {
                  const result = parsePrice(value);
                  return result.ok || result.error;
                },
              })}
            />
            <span id={priceSuffixId} className="shrink-0 text-text-secondary">
              {LISTING_TEXT.priceSuffix}
            </span>
          </div>
          <FieldHint id={priceId}>{LISTING_TEXT.priceHint}</FieldHint>
          <FieldError id={priceId} message={errors.price?.message} />
          {check.level !== 'ok' && check.ratio !== null && market && latestPrice !== null && (
            <div
              id={priceCheckId}
              data-level={check.level}
              className={cn(
                'flex items-start gap-2 rounded-lg border bg-neutral-bg px-3 py-2 text-sm text-neutral-text',
                check.level === 'confirm' ? 'border-negative' : 'border-border',
              )}
            >
              {check.level === 'confirm' ? (
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-negative"
                />
              ) : (
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              )}
              <p>
                {check.level === 'confirm'
                  ? LISTING_TEXT.confirm(
                      comparisonWords(check.ratio),
                      market,
                      formatKES(latestPrice),
                    )
                  : LISTING_TEXT.caution(comparisonWords(check.ratio), market)}
              </p>
            </div>
          )}
          {confirmNeeded && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-text">
              <input
                type="checkbox"
                className="size-6 shrink-0 accent-primary"
                checked={confirmedFor === priceText}
                onChange={(event) => setConfirmedFor(event.target.checked ? priceText : null)}
              />
              <span>{LISTING_TEXT.confirmCheckbox}</span>
            </label>
          )}
        </div>

        {estimate && quantity.ok && (
          <p className="flex flex-wrap items-center gap-2 text-text" data-testid="listing-estimate">
            <span className="rounded-md bg-neutral-bg px-2 py-0.5 text-sm font-medium text-neutral-text">
              {LISTING_TEXT.estimateLabel}
            </span>
            <span>
              {LISTING_TEXT.estimate(formatQuantity(quantity.value), formatKES(estimate))}
            </span>
          </p>
        )}

        <PhotoPicker
          value={photo}
          onChange={(next) => {
            setPhotoServerError(null);
            setPhoto(next);
          }}
          currentUrl={isEdit ? (listing?.image_url ?? null) : null}
          currentAlt={
            listing ? LISTING_TEXT.photoAlt(cropLabel(listing.crop).toLowerCase()) : undefined
          }
          serverError={photoServerError}
          disabled={formDisabled || pending}
        />

        {isEdit && !hasChanges && (
          <p className="text-sm text-text-secondary" id={`${ID}-no-changes`}>
            {LISTING_TEXT.noChanges}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={submitDisabled}
            aria-describedby={isEdit && !hasChanges ? `${ID}-no-changes` : undefined}
          >
            {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
            {submitLabel}
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/farmer/listings">{LISTING_TEXT.cancel}</Link>
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={zeroOpen}
        onOpenChange={setZeroOpen}
        title={LISTING_TEXT.zeroTitle}
        description={LISTING_TEXT.zeroText}
        confirmLabel={LISTING_TEXT.zeroConfirm}
        cancelLabel={LISTING_TEXT.cancel}
        onConfirm={() => {
          setZeroOpen(false);
          const values = zeroValues.current;
          zeroValues.current = null;
          if (values) send(values);
        }}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
        title={LISTING_TEXT.leaveTitle}
        description={LISTING_TEXT.leaveText}
        confirmLabel={LISTING_TEXT.leaveConfirm}
        cancelLabel={LISTING_TEXT.stay}
        destructive
        onConfirm={() => {
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </div>
  );
}
