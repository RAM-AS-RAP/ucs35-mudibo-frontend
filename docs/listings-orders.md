# Farmer listings and orders (F2b)

What the farmer's listing and order screens do, the rules behind them, and their limits. This
document is also material for the thesis report.

## Screens and endpoints

| Screen         | Route                       | What it does                                                                                                                                                                                                                                                           | Endpoints                                                                                                   |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| My listings    | `/farmer/listings`          | The farmer's listings, newest first, 20 at a time ("Load more", "Showing X of Y"), filtered by status (All, Active, Sold out, Removed; `?status=` in the URL). Each card: photo, crop and market, quantity available, price per kg, status, Edit, Remove, View orders. | `GET /listings/mine?status=&limit=20&offset=`, `DELETE /listings/{id}`                                      |
| New listing    | `/farmer/listings/new`      | Crop, market, quantity, asking price per kg, optional photo, with price guidance. `?crop=&market=` (from the forecast screen's "Plan a listing") preselect valid values only.                                                                                          | `GET /markets`, `GET /prices/current`, `GET /forecasts` (guidance), `POST /listings` (multipart)            |
| Edit listing   | `/farmer/listings/:id/edit` | Quantity, price and photo of one listing; crop and market are read only. Only changed fields are sent.                                                                                                                                                                 | `GET /listings/mine` (lookup, see below), `PATCH /listings/{id}` (multipart)                                |
| Orders         | `/farmer/orders`            | Orders on the farmer's listings with status filters, an optional one listing filter (`?listing=`), "Load more" and "Refresh". Refreshes when the window regains focus; never polls.                                                                                    | `GET /listings/mine/orders?status=&listing_id=&limit=20&offset=`                                            |
| Dashboard card | `/farmer`                   | Number of active listings and paid orders, a New listing button and links to both screens. A failed count shows a short message in that card only.                                                                                                                     | `GET /listings/mine?status=active&limit=1`, `GET /listings/mine/orders?status=paid&limit=1` (reads `total`) |

Removing a listing asks first ("Remove this listing? Buyers will no longer see it. Orders that are
already paid are not affected."). A 409 `listing_has_pending_orders` is shown inside the dialog with
only a Close button; a 404 closes the dialog and refreshes the list.

There is no endpoint for a farmer to fetch one listing (`GET /listings/{id}` is the buyer's and
answers 403 to a farmer). The edit screen reads the listing from the cached list, or pages through
`GET /listings/mine?limit=100` (at most 5 pages) until the id is found; otherwise it shows "This
listing could not be found." The README lists this under Known backend gaps.

## Quantity: available now

`quantity_available` is the quantity a buyer can order **now**: the backend has already taken out the
quantity reserved by orders waiting for payment. The edit screen says so next to the field. Setting the
quantity to 0 asks first ("Setting the quantity to 0 marks this listing as sold out."); raising a sold
out listing above 0 shows "This listing will become active again." The backend applies both status
changes; the frontend only explains them.

## Numbers and money

- Quantities and prices are typed as text and checked by `parseDecimalInput` (`src/lib/decimal.js`):
  finite, greater than 0 (quantity may be 0 when editing), at most 2 decimals, at most 100 000, a dot
  for decimals ("Use a dot for decimals, for example 82.50"), no exponent, no letters.
- They are sent as normalised strings (`"82.5"`), never as JavaScript numbers.
- The "If all 120 kg sell at this price: KES 5,040.00" line is an estimate, labelled as such. It is
  computed by `multiplyMoney` on scaled BigInt values (no floating point) and rounded half up.
- Every other amount is the server's: an order's `total_amount` is shown as returned and never
  recomputed (2.5 kg at KES 112.56 shows the server's KES 281.00, not 281.40).

## Price sanity guard

The most likely costly slip is typing the price of a 90 kg bag where the form asks for the price of
1 kg (KES 3,600 instead of KES 40). `checkAskingPrice` (`src/lib/priceCheck.js`) compares the asking
price with the latest market price of the crop in the chosen market:

| Asking price / latest price | Level   | Screen                                                                                             |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| 0.7 to 1.4                  | ok      | Nothing extra                                                                                      |
| 0.5 to 0.7, or 1.4 to 2     | caution | "This is about 60% above the latest price in Nairobi. Check that the price is for 1 kg."           |
| below 0.5 or above 2        | confirm | A stronger message, and Save stays disabled until "The price is for 1 kg and is correct" is ticked |

The thresholds are constants in one place, compared with integer arithmetic so the edges are exact.
Without a latest price the level is ok. The guard never blocks a price outright: the farmer decides.
Changing the price after ticking asks again.

The price guidance panel beside the form shows the latest price per kg, the one month forecast's
expected change ("In 1 month +6.2% Increasing"), where the figures come from, a link to the forecast
and "You choose the price you ask for." It follows the F2a relative time rule (no month, year or
date) and stays quiet when prices or the forecast cannot be loaded.

## Photo pipeline

1. **Choose:** "Take a photo" (`capture="environment"`) or "Choose from gallery", both
   `accept="image/jpeg,image/png"`.
2. **Prepare in the browser** (`prepareImage`, `src/lib/image.js`, loaded with a dynamic import only
   on the create and edit screens): refuse other types and files over 20 MB; decode with
   `createImageBitmap(file, { imageOrientation: "from-image" })` (falls back to an `<img>`); refuse more
   than 40 megapixels; scale so the longest side is at most 1600 px (never upscale); draw on a white
   canvas (a transparent PNG becomes white); encode as JPEG at quality 0.85, then 0.7, then 0.55 at
   1280 px until it fits the 5 MiB upload limit, otherwise fail with `still_too_large`. The bitmap is
   closed and every object URL revoked.
3. **Metadata:** re-encoding through a canvas drops all metadata, including the GPS location phone
   cameras write into photos. The screen says "Photos are resized automatically. Location data in
   photos is removed."
4. **Upload:** the JPEG goes as the `image` part named `photo.jpg` with a 60 second upload timeout.
5. **Server:** re-encodes every image as JPEG without metadata, downscales to 1600 px, and answers 422
   `invalid_image` or 413 `image_too_large` (shown next to the photo).
6. **Display:** `image_url` is rendered only through `safeImageUrl` (https, or `http://localhost` and
   `http://127.0.0.1` in development), with `loading="lazy"`, `decoding="async"` and an `alt` such as
   "Photo of maize listing"; otherwise a leaf placeholder.

A screen reader hears "Preparing photo" and "Photo ready, 240 kB" (`aria-live="polite"`).

## Multipart requests

Multipart bodies are built only in `src/api/endpoints/listings.js` (`buildListingForm`) from a plain
object: only the field names the route accepts (`CREATE_FIELDS`, `UPDATE_FIELDS`), only defined
values, decimals as strings, `remove_image` as `"true"`. `unit`, `status` and `farmer_id` are never
sent (the server defaults `unit` to kg, the only unit). The `FormData` is passed to the generated
client with an identity body serializer and no `Content-Type` header, so the browser writes
`multipart/form-data; boundary=…` itself.

## Uncertain writes: no automatic retries

Create, edit and remove are `useMutation`s with `retry: false`. A retry after a timeout could create a
second listing, because the first request may have reached the server. After a timeout or network
failure the form says "We could not confirm whether your listing was saved. Check My listings before
trying again." with a link to My listings, and offers no automatic retry. The submit button is
disabled with a spinner while a request is in flight, and a second click sends nothing. A 429 disables
the button for `Retry-After` seconds (60 without the header), as in F1. Leaving a form with unsaved
changes asks first (the router's blocker) and the browser warns on reload or close (`beforeunload`).

## Orders view

- Status words with an icon: "Paid (test payment)", "Waiting for payment", "Not paid, expired",
  "Cancelled", "Payment failed", "Under review".
- Payments run in the Safaricom M-Pesa sandbox. The info box shows the response's `note` (or "Payments
  run in a test environment. A paid order is a test confirmation and no real money moves.").
- A paid order shows "Test payment received, receipt <number>" (the receipt only when present) and
  when the payment completed. Times are shown in Nairobi time.
- **No contact details:** the API returns only the buyer's name, and the screen never shows or asks
  for a phone number, email or id. "AgriSence does not arrange delivery or share contact details in
  this prototype. Agree handover directly with the buyer through your own channels."
- **"Not paid" filter:** `GET /listings/mine/orders` accepts one `status`. "Not paid" therefore loads
  all orders and keeps the expired, cancelled and failed ones from the pages loaded so far, with the
  note "Not paid groups expired, cancelled and failed orders from the orders loaded so far. Load more
  to check older orders." and the count "3 not paid among the 7 of 7 orders loaded."

## Accessibility

- Every control is labelled, keyboard operable and at least 44 by 44 px; inputs use 16 px text and
  `inputMode="decimal"`.
- Status filters are native radio groups (Tab to the group, arrow keys to move).
- Dialogs (remove, quantity 0, leave without saving) use the shadcn dialog: focus moves in, Escape
  closes, and focus returns to the button that opened them (or the page heading when that button is
  gone).
- Server errors go to a summary that takes focus, with links to the fields; field errors use an icon
  and text.
- Statuses and price warnings use an icon and words, never colour alone.
- Loading states are announced (`role="status"`).

## Limitations

- No endpoint for a farmer to fetch one listing (see above).
- No photo editing beyond the automatic resize; one photo per listing; JPEG and PNG only (no HEIC).
- No notifications: the farmer learns about orders by opening the Orders screen.
- Orders do not refresh automatically except when the window regains focus or "Refresh" is pressed.
- The "Not paid" filter groups only the pages loaded so far.
- Payments are sandbox confirmations; delivery is arranged outside the platform.
