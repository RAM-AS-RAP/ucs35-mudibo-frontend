# Buyer browse, checkout and M-Pesa payment (F3)

What the buyer screens do, the rules behind them and their limits. This document is also
material for the thesis report (the "Pay with MPESA" sequence diagram is in section 6).

Payments run only in the Safaricom M-Pesa sandbox: the product is a research prototype and no
real money moves. A paid order is a simulated confirmation. The prototype does not arrange
delivery or exchange contact details: the buyer sees only the seller's name.

## 1. Screens and endpoints

| Screen                   | Route                        | What it does                                                                                                                                                                                                                                                                                                                          | Endpoints                                                                                               |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Buyer home               | `/buyer`                     | Redirects (replace) to `/buyer/browse`. `/buyer` stays the buyer's home path in `roles.js`.                                                                                                                                                                                                                                           | none                                                                                                    |
| Browse produce           | `/buyer/browse`              | Active listings with stock, 20 at a time ("Load more", "Showing X of Y"). Filters in the URL: `crop` (All, Maize, Beans), `market` (from `GET /listings/markets`, "All markets"), `min` and `max` price per kg (decimal, at most 100 000, 400 ms debounce), `sort` (Newest, Price: low to high, Price: high to low), "Clear filters". | `GET /listings/markets`, `GET /listings?crop=&market=&min_price=&max_price=&sort=&limit=20&offset=`     |
| Listing detail, checkout | `/buyer/listings/:listingId` | Photo, crop, market, seller name, price per kg and about a 90 kg bag, quantity available, a "Sold out" banner. Quantity stepper, order summary with the estimate, "Continue to checkout".                                                                                                                                             | `GET /listings/{id}`, `POST /orders`                                                                    |
| Order and payment        | `/buyer/orders/:orderId`     | Order summary (reference with copy, status, listing, quantity, unit price, the server's total, order time), countdown, payment panel, sandbox note. Pay, wait for the phone, result, cancel.                                                                                                                                          | `GET /orders/{id}` (polled while a prompt is open), `POST /orders/{id}/pay`, `POST /orders/{id}/cancel` |
| My orders                | `/buyer/orders`              | The buyer's orders, newest first, with status chips (All, Waiting for payment, Paid, Not paid, Under review; `?status=`), "Continue payment" when `can_pay`, "Load more", "Refresh". Refreshes on window focus; never polls.                                                                                                          | `GET /orders/mine?status=&limit=20&offset=`                                                             |
| Navigation badge         | every buyer screen           | "My orders" shows the number of orders waiting for payment ("2 orders waiting for payment" for screen readers). No badge for zero or after a failed request.                                                                                                                                                                          | `GET /orders/mine?status=pending_payment&limit=1` (reads `total`)                                       |

Buyers cannot call `GET /markets`, `GET /prices/*` or `GET /forecasts` (403). No buyer screen calls
them; a source check and every buyer screen test assert it. The market filter offers exactly the
markets from `GET /listings/markets` (`useBuyerMarkets`; markets with at least one listing the buyer
can buy, ordered by name; no price data). A `market` in the URL waits for that list before the first
browse request and is removed when it is not on the list. If the list cannot be loaded, the URL's
market is still sent (the server validates it, 422 for an unknown one), and the filter shows "The
list of markets could not be loaded." with "Load markets again".

**"Not paid" filter.** `GET /orders/mine` accepts one `status`. "Not paid" therefore loads all
orders and keeps the expired, cancelled and failed ones from the pages loaded so far, exactly as
the farmer's orders screen (F2b) does; both use `filterNotPaid` from `src/lib/filterParams.js`. The
screen says "Not paid groups expired, cancelled and failed orders from the orders loaded so far.
Load more to check older orders." and counts "3 not paid among the 6 of 6 orders loaded."

## 2. Checkout rules

- The quantity is typed as text (`inputMode="decimal"`) or changed with the minus and plus buttons
  (step 1 kg, kept between 1 kg and the quantity available, on integer hundredths so 2.5 + 1 is
  3.5). It is checked by `parseDecimalInput` (a dot for decimals, at most 2 decimals, at most
  100 000), then against the minimum of 1 kg and the available quantity ("Only 12.5 kg available.").
- The estimate is `estimateTotalKES` (`src/lib/orderTotals.js`): quantity times price per kg on
  BigInt hundredths, rounded **up** to a whole shilling, like the server (2.5 kg at KES 112.56 is
  KES 282). It is labelled "Estimate. The final amount is confirmed when you check out." Below
  KES 10 the screen says "The minimum order is KES 10." and disables the button.
- `POST /orders` gets exactly `{listing_id, quantity}`; the quantity is the normalised decimal
  string (the spec accepts a number or a string). Nothing else is sent: the server derives the
  buyer, the price, the total and the status.
- After the 201 the screen opens `/buyer/orders/<id>` (a push, so Back returns to the listing; a
  second checkout there finds the open order, so there is no loop) with the toast "Order created.
  Complete payment within 5 minutes." The stock is reserved for about 5 minutes.
- **Never retried.** Order creation uses `useMutation` with `retry: false`. A second click while
  the request runs sends nothing (a ref guard and the disabled button). After a network failure or
  a timeout the result is unknown: "We could not confirm whether your order was created. Check My
  orders before trying again." with a link to My orders, and no automatic retry. The browser warns
  before leaving only while the request is in flight (`beforeunload`).

## 3. Order states and payment states

`deriveOrderView(order, {nowMs, offsetMs})` (`src/lib/orderView.js`) turns the server's order
into one panel "kind". The buttons follow the server's `can_pay` and `can_cancel` exactly: the
client copies them and never turns either on.

### Order status table

| `status`               | Condition                                  | Panel kind                             | What the buyer sees                                                                                                                             |
| ---------------------- | ------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending_payment`      | a prompt is open (see the payment table)   | `awaiting_phone`                       | Spinner, "Check your phone and enter your M-Pesa PIN", "Prompt sent to 254\*\*\*\*\*\*\*149", the server's `status_message`, the one prompt tip |
| `pending_payment`      | `is_expired` true                          | `expired`                              | As `expired` below                                                                                                                              |
| `pending_payment`      | `can_pay` false and `payment.attempts` ≥ 3 | `max_attempts`                         | "You have tried to pay for this order 3 times. Cancel it and start a new order." Pay disabled, Cancel when `can_cancel`                         |
| `pending_payment`      | `can_pay` false and at most 90 s left      | `too_close`                            | "There is not enough time left to start a payment. Cancel this order and start again." Pay disabled, Cancel                                     |
| `pending_payment`      | otherwise                                  | `pay_ready` (or a payment result kind) | Countdown, "Pay with M-Pesa" (enabled only when `can_pay`), the prompt hint, Cancel when `can_cancel`                                           |
| `paid`                 |                                            | `paid`                                 | "Payment received (test)", the receipt when present, the total, the reference, "no real money moved", Browse and My orders                      |
| `expired`              |                                            | `expired`                              | "This order expired and the produce was released. You can start a new order." Link to the listing                                               |
| `cancelled`            |                                            | `cancelled`                            | "You cancelled this order." Link to browse                                                                                                      |
| `needs_reconciliation` |                                            | `under_review`                         | "Your payment is under review. If money was taken, an administrator will check it. Keep your reference AGR-…." No refund promise                |
| `payment_failed`       | (order closed by the server)               | `closed_other`                         | "This order is closed because the payment did not complete. You can start a new order."                                                         |

### Payment status table (`payment.status` while the order is `pending_payment`)

| `payment.status` | Panel kind          | Polling   | What the buyer sees                                                                             |
| ---------------- | ------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| none             | `pay_ready`         | no        | "Pay with M-Pesa"                                                                               |
| `initiating`     | `awaiting_phone`    | every 3 s | Badge "Sending request", the waiting panel                                                      |
| `initiated`      | `awaiting_phone`    | every 3 s | Badge "Waiting for your phone", the waiting panel                                               |
| `completed`      | `awaiting_phone`    | every 3 s | Keeps polling until the order is `paid` (usually the same response)                             |
| `cancelled`      | `payment_cancelled` | stops     | "You cancelled the payment request." and "Try again" when `can_pay`                             |
| `failed`         | `payment_failed`    | stops     | The server's `status_message`, "Reason: <result_desc>" when present, "Try again" when `can_pay` |
| `timeout`        | `payment_timeout`   | stops     | The server's `status_message`, "Try again" when `can_pay`                                       |

A failed, cancelled or timed out payment leaves the order `pending_payment`, so the buyer can try
again until the order expires or the attempt limit (3) is reached; the server then sets `can_pay`
false and the panel explains why.

## 4. Polling, the countdown and the server clock

**Polling** (`nextPollInterval`, `src/lib/polling.js`; `useOrder`, `src/api/queries/buyer.js`):

- `GET /orders/{id}` every **3 seconds** (`POLL_INTERVAL_MS`) while the payment is open
  (`initiating`, `initiated`, or `completed` on a pending order) and the order is
  `pending_payment`.
- For at most **150 seconds** (`POLL_WINDOW_MS`) from the start of the window. The window starts
  when the screen opens, when a payment starts (202), and when the buyer presses "Check again".
  After 150 seconds polling stops and the panel says "We have not received a result yet. Your
  order stays open until the timer ends. Check again, or leave and find this order in My orders."
- **Paused while the tab is hidden** (TanStack Query skips the interval when the document is
  hidden) and refetched at once when it becomes visible (stale time 0, refetch on focus).
- Stops on any final state, when the payment ended without success, on unmount (no timer is left
  behind), and after a 4xx answer (a 401 also signs out through the F0 client middleware).
- The server may check the payment with Safaricom while answering `GET /orders/{id}`, so polling
  also covers a lost callback.

**Countdown** (`ExpiryCountdown`): "Complete payment within mm:ss" while the order is
`pending_payment` and not expired. The device clock may be wrong, so the time left is measured on
the server's clock:

```
offsetMs        = Date.parse(server_time) - (device time when the response arrived)
remainingSeconds = max(0, floor((Date.parse(expires_at) - (Date.now() + offsetMs)) / 1000))
```

`offsetMs` is recomputed from every response (`useOrder` uses the query's `dataUpdatedAt`). A
device 5 minutes behind or ahead still shows 05:00 for a fresh order (tested). One interval ticks
every second and is cleared on unmount. Screen readers hear the countdown only at 60 seconds, 30
seconds and at the end ("The time to pay has ended."), from an `aria-live="polite"` region that
the order screen keeps mounted (the countdown itself disappears when the order expires). At zero
the screen refetches the order once and then shows the server's expired state.

## 5. The idempotency key

`POST /orders/{id}/pay` needs an `Idempotency-Key` header (8 to 64 letters, digits, `-` and `_`)
and an empty body. Sending the same key again returns the current state with 202 and **never sends
a second STK prompt**; a new key may send a new prompt.

| Moment                                                | Key                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| The buyer clicks "Pay with M-Pesa" or "Try again"     | A new key from `newIdempotencyKey()` (`crypto.randomUUID`, or 16 random bytes as hex) |
| The request fails with `network_error` or `timeout`   | Kept. The button reads "Check payment request" and sends the same key                 |
| A 202 arrives                                         | Discarded. Polling starts                                                             |
| Any error with an HTTP status (409, 429, 502, 503, …) | Discarded. The next deliberate attempt gets a new key                                 |

Why: after a network failure or a timeout the browser cannot know whether the server received the
request and sent a prompt. Resending with the same key is safe (the server replays), while a new
key could send a second prompt. Once the server has answered, the attempt is over, and reusing that
key for a new attempt would only replay the old answer.

The key lives only in a component ref (`useRef`) of the order screen. It is never written to
`sessionStorage`, `localStorage`, the URL, router state, a query key or the mutation's variables
(the mutation reads it from the ref), and never logged. Only `src/api/endpoints/payments.js` sets
the header and only `src/lib/idempotency.js` creates keys (source checks).

## 6. A payment as seen by the browser

```
Buyer            Browser (AgriSence)                         Backend API                Safaricom sandbox
  |  Continue to    |                                             |                          |
  |  checkout ----->| POST /orders {listing_id, quantity} ------->| reserve stock ~5 min     |
  |                 |<------------- 201 OrderOut (pending_payment, expires_at, server_time,
  |                 |               total_amount, can_pay, can_cancel)                       |
  |                 | open /buyer/orders/<id>, start countdown    |                          |
  |  Pay with       |                                             |                          |
  |  M-Pesa ------->| key = newIdempotencyKey()  (ref only)       |                          |
  |                 | POST /orders/<id>/pay  Idempotency-Key: key, no body ------>|           |
  |                 |                                             | STK push --------------->|
  |                 |<------------- 202 PaymentStartOut (payment initiated, message, prompt)|
  |                 | discard key, show "Check your phone",       |                          |
  |                 | start the 150 s polling window              |                          |
  |  phone prompt <-|---------------------------------------------|--------------------------|
  |  enters PIN on  |                                             |                          |
  |  the phone ---->|---------------------------------------------|------------------------->|
  |                 | every 3 s: GET /orders/<id> --------------->| (callback or status      |
  |                 |<------------- 200 OrderOut (payment initiated) query to Safaricom) <---|
  |                 | ...                                         |                          |
  |                 | GET /orders/<id> -------------------------->|                          |
  |                 |<------------- 200 OrderOut (status paid, receipt)                      |
  |                 | stop polling, show "Payment received (test)"|                          |
```

Variations: a network failure or timeout on the pay request keeps the key and "Check payment
request" repeats it; a cancelled, failed or timed out payment stops polling and offers "Try again"
(a new key) while `can_pay` is true; 150 seconds without a result stops polling and offers "Check
again"; the countdown reaching zero refetches once and shows the expired state.

## 7. Error codes and messages

Order creation (`src/api/errors.js`, shown in the error summary of the listing screen):

| Code                       | Status | Message and action                                                                                                                                                  |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listing_not_found`        | 404    | "This listing is no longer available." (the unavailable state, link to browse)                                                                                      |
| `listing_unavailable`      | 409    | "This listing is no longer available." (the unavailable state)                                                                                                      |
| `insufficient_stock`       | 409    | "There is not enough produce left. Choose a smaller quantity." The listing is refetched: "The available quantity was updated: 3 kg available now." The form is kept |
| `pending_order_exists`     | 409    | Opens `/buyer/orders/<existing_order_id>` with the toast "You already have an order waiting for payment for this listing. Continue it or cancel it first."          |
| `too_many_pending_orders`  | 409    | "You have 3 orders waiting for payment. Pay for or cancel one first." with a link to My orders filtered to waiting for payment                                      |
| `order_too_small`          | 422    | "The total is below the minimum order of KES 10."                                                                                                                   |
| `validation_error`         | 422    | "Please check the highlighted fields."                                                                                                                              |
| `rate_limited`             | 429    | "Too many attempts. Try again in N seconds." The button counts down `Retry-After` (60 without it)                                                                   |
| `network_error`, `timeout` | none   | "We could not confirm whether your order was created. Check My orders before trying again." No retry                                                                |
| anything else              |        | The message from `getUserMessage` and "Reference: <request id>"                                                                                                     |

Payment (`mapPayError`, `src/lib/payErrors.js`; every message is announced in the panel's
`aria-live="polite"` region):

| Code                                                  | Status | Message                                                                                                                                   | Action                             |
| ----------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `order_not_payable`                                   | 409    | "This order can no longer be paid. Its current state is shown below."                                                                     | refetch                            |
| `order_expiring` (reason `too_close`)                 | 409    | "There is not enough time left to start a payment. Cancel this order and start again."                                                    | cancel hint                        |
| `order_expiring` (reason `expired`)                   | 409    | "This order has expired."                                                                                                                 | refetch                            |
| `payment_in_progress`                                 | 409    | "A payment is already in progress. Check your phone."                                                                                     | refetch (waiting panel)            |
| `max_attempts_reached`                                | 409    | "You have tried to pay for this order 3 times. Cancel it and start a new order."                                                          | cancel hint                        |
| `too_many_payment_attempts`                           | 429    | "Too many payment attempts for this phone number. Please try again later."                                                                | wait `Retry-After` (60 without it) |
| `payments_unavailable`, any 503                       | 503    | "Payments are temporarily unavailable. Please try again soon."                                                                            | wait `Retry-After` when given      |
| `payment_request_failed`                              | 502    | "Could not start the M-Pesa prompt. Please try again."                                                                                    | new key                            |
| `idempotency_key_required`, `invalid_idempotency_key` | 422    | "Something went wrong. Please try again."                                                                                                 | new key                            |
| `order_not_found`                                     | 404    | "This order could not be found."                                                                                                          | refetch (not found state)          |
| `network_error`, `timeout`                            | none   | "We could not confirm whether the payment request was sent. Press "Check payment request" to find out. You will not get a second prompt." | same key                           |
| anything else                                         |        | `getUserMessage(error)`                                                                                                                   | none                               |

Cancel: a 200 shows the toast "Order cancelled" and the cancelled state (also when it was already
cancelled). 409 `payment_in_progress` ("A payment is in progress. Please wait for it to finish.")
and 409 `order_not_cancellable` ("This order can no longer be cancelled. Its current state is shown
below.") close the dialog and refetch the order. Other errors stay in the dialog.

## 8. Accessibility

- Every screen moves focus to its heading on navigation (`usePageTitle`) and was checked with axe
  in its loading, empty, error, success and dialog states, and for each payment panel kind.
- Each browse card is one link with one clear name ("Maize in Nairobi, KES 42.00 per kg, Sold by
  Grace Wanjiru"); photos have an `alt` such as "Photo of maize for sale".
- The crop chips and the order status chips are native radio groups; the market and sort filters
  are native selects; price and quantity fields use `inputMode="decimal"` and 16 px text.
- The stepper buttons are 44 by 44 px, labelled ("Increase quantity by 1 kg") and keyboard
  operable; the quantity field is described by its hint and its error.
- The payment panel shows an icon, a headline and words for every state (never colour alone),
  moves focus to its headline when the state changes, and announces messages in a polite live
  region. Status badges pair an icon with words ("Waiting for your phone", "Payment failed").
- The countdown is announced only at 60 seconds, 30 seconds and at the end, never every second.
- The cancel dialog takes focus when it opens and returns it to the "Cancel order" button (or to
  the panel headline once the order is cancelled).
- The navigation badge's number is hidden from screen readers and replaced by "2 orders waiting
  for payment". Its colours (white on the negative text colour) pass the contrast test.
- The PIN warning is plain text on every checkout and payment screen: "Enter your M-Pesa PIN only
  on the prompt on your phone. AgriSence never asks for your PIN." There is no PIN field.

## 9. Limitations

- **Polling, not push.** The browser asks for the payment result every 3 seconds for up to 150
  seconds. A result that arrives later is seen on "Check again", on reload or in My orders.
- **Mirrored minimum values.** The 1 kg minimum quantity, the KES 10 minimum total, the 90 second
  payment margin and the 3 attempt limit are copies in `src/lib/constants.js`, used only to explain
  disabled buttons. The server decides (`can_pay`, 422 `order_too_small`); a backend change must
  be copied by hand. The KES 10 minimum is not in `openapi.json` or `frontend_contract.md`.
- **No contact exchange and no delivery.** The buyer sees only the seller's name; handover is not
  part of the prototype.
- **Sandbox only.** No real money moves; a paid order is a simulated confirmation. There are no
  refunds: an order under review is checked by an administrator.
- **A prompt can be delayed or missed.** The buyer is told to wait for the open prompt to expire
  before trying again. Only one prompt can be active on a phone at a time.
- **"Not paid"** groups only the orders loaded so far (as in F2b).
- The idempotency key is lost if the tab is closed during an unknown result; the buyer then checks
  the order again, and a new attempt is protected by the server's `payment_in_progress` check.
