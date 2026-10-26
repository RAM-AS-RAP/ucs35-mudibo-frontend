# Administrator console (module F4)

The administrator screens of AgriSence: what each one shows, which endpoints it calls, what the
interface hides and what the server enforces, how orders under review are resolved, what
administrators may see, and the limits of this prototype. The backend is the authority for every
rule here; the screens only make its rules visible and its actions safe to use.

## Screens and endpoints

All routes are under `/admin`, lazily loaded, and guarded by `RequireRole('admin')`. Every list
shows a loading skeleton, an `ErrorState` with "Try again" and the request id ("Reference"), an
empty state, "Showing X of Y" with "Load more" (20 per page), and a "Refresh" button. Lists refetch
when the window regains focus; nothing polls.

| Screen               | Path                       | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Endpoints                                                                                                                              |
| -------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard            | `/admin`                   | Users by role and disabled accounts; listings, orders and payments per status (every status shown, zero when absent); "Completed test payments" with "Test environment amounts. No real money."; "Needs attention" (orders needing review, payments waiting more than 10 minutes, with links to the filtered lists, or "Nothing needs attention."); "Data pipeline health" per market and crop (latest price month, the month the latest forecast is based on, "Current" or "Out of date"), with when prices were last fetched and forecasts last generated. One request; a failure shows one error for the whole page. | `GET /admin/stats`                                                                                                                     |
| Users                | `/admin/users`             | Every account: name (with "Main admin"), role, email, status (with the disabled date and who disabled it), activity (listings for farmers, orders for buyers), created and by whom. Role chips, status chips and a search by name or email. There is no phone column or line (accounts have no phone number since identity v2). Disable or Enable after a confirmation. A note that people reset their own password and administrators cannot set or view passwords.                                                                                                                                                                                                                          | `GET /admin/users`, `PATCH /admin/users/{id}/disable`, `PATCH /admin/users/{id}/enable`                                                |
| Invites (main admin) | `/admin/invites`           | "Send invitation" (name and email only), the result with the accept invitation page address to copy, the invitations by status (Pending, Used, Expired, Revoked, Locked) with codes sent and wrong codes, Resend (pending), Revoke (pending and locked), and "Check email delivery".                                                                                                                                                                                                                                                                                                                                     | `GET /admin/invites`, `POST /admin/invites`, `POST /admin/invites/{id}/resend`, `DELETE /admin/invites/{id}`, `POST /admin/email/test` |
| Listings             | `/admin/listings`          | Every listing: photo, crop, market, quantity, price, status (who removed it and when), farmer with a "Farmer disabled" tag, orders waiting for payment and paid. Status and crop chips, a market select and a search by farmer. Remove after a confirmation.                                                                                                                                                                                                                                                                                                                                                            | `GET /admin/listings`, `DELETE /admin/listings/{id}`, `GET /markets` (market names)                                                    |
| Orders               | `/admin/orders`            | Every order in the order the API returns: reference (link), status, buyer, seller, produce, total, latest payment status, receipt, created. One chip per status (Needs review, Waiting for payment, Paid, Expired, Cancelled, Failed) and a search by reference or buyer name. Orders that need review carry a warning icon, the words "Needs review" and a red left border.                                                                                                                                                                                                                                            | `GET /admin/orders`                                                                                                                    |
| Order detail         | `/admin/orders/:orderId`   | The summary, the parties, the listing id, every payment (status, amount, number entered, masked phone, receipt, result, environment, created, completed, callback received) with "View events", the review panel for orders that need review, and the resolution once there is one.                                                                                                                                                                                                                                                                                                                                     | `GET /admin/orders/{id}`, `POST /admin/orders/{id}/resolve`, `GET /admin/payments/{id}/events`                                         |
| Payments             | `/admin/payments`          | Every payment request: order reference (link), buyer, amount, status, number entered, masked phone, receipt, result, environment, attempt, created, completed, and "View events". Status chips, an environment select, an order reference search (6 to 12 characters, as the API accepts) and a date range.                                                                                                                                                                                                                                                                                                             | `GET /admin/payments`, `GET /admin/payments/{id}/events`                                                                               |
| Forecast accuracy    | `/admin/forecast-accuracy` | Summary cards per horizon and source, "What these mean", the API's note, and a table of forecasts with the months, prices, error, "Direction correct", "Beat persistence" and a Live or Backfill tag. Filters: market, crop, horizon, source and "Include pending".                                                                                                                                                                                                                                                                                                                                                     | `GET /admin/forecast-accuracy`, `GET /markets`                                                                                         |

The navigation lists Dashboard, Users, Invites (main administrator only), Listings, Orders,
Payments and Forecast accuracy. "Orders" shows a count of the orders that need review
(`GET /admin/orders?status=needs_reconciliation&limit=1`, reading `total`), announced as "N orders
need review"; a failed request shows no badge.

## Role model: what the interface hides and what the server enforces

| Who                                         | Can use                                           | The interface                                                                                                                                      | The server                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator (`role: admin`)               | Every `/admin` screen except Invites              | Hides Invites from the navigation; `/admin/invites` shows "No access" (`RequireSuperAdmin`). Offers Disable or Enable only for farmers and buyers. | Checks the admin role on every `/admin` request. Answers 403 `forbidden` when an ordinary administrator acts on another administrator. |
| Main administrator (`is_super_admin: true`) | Everything, including Invites and the email check | Shows Invites; offers Disable or Enable also for other administrators.                                                                             | Checks `is_super_admin` on every invite and email check request.                                                                       |
| Everyone                                    | —                                                 | Never offers an action on the main administrator's row or on one's own row (`canToggleUser`).                                                      | 403 `cannot_modify_super_admin` and `cannot_disable_self`.                                                                             |
| Farmers, buyers                             | No admin screen                                   | Every `/admin` route shows "No access"; no admin request is sent.                                                                                  | 403 on every admin route.                                                                                                              |

`isSuperAdmin` comes from the backend user object (`is_super_admin` in the login response and in
`GET /auth/me`) and only controls UI visibility. It is never inferred from another endpoint. The
users screen also needs the administrator's own id (from `GET /auth/me`) to leave out their own row.
When the server refuses an action anyway, the dialog shows its reason and the list is refreshed.

## Reconciliation workflow

**What puts an order in review.** The backend sets an order to `needs_reconciliation` when a payment
result arrives in a state it did not expect. The `reconciliation.reason` says what was observed:

| Reason                      | Shown as                                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `late_success_after_expiry` | A payment confirmation arrived after this order had expired. The produce may already have been released to other buyers.                                                                                        |
| `success_on_closed_payment` | A payment confirmation arrived for a payment request that had already been closed, for example after it was recorded as cancelled or timed out. The buyer may have paid even though the order shows no payment. |
| `success_on_closed_order`   | A payment confirmation arrived after this order had been closed. The buyer may have paid for an order that is no longer open.                                                                                   |
| `amount_mismatch`           | The amount in the payment confirmation did not match the order total. Check the payment events before deciding.                                                                                                 |
| anything else               | A general sentence asking the administrator to check the payment events.                                                                                                                                        |

The sentences state what was observed and never claim certainty about where money is.

**The two actions.** The review panel shows the reason, the status before the review
(`order_status_before`) and when the order was flagged, and offers "Confirm sale" and "Void
order". Each opens a confirmation that lists its consequences and requires a note (10 to 500
characters, with a counter; "This note is kept with the order."). The request body is exactly
`{action, note}`.

| Action       | Status before                                | Effect shown (the server decides)                                                                          |
| ------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Confirm sale | `pending_payment`                            | The order becomes paid. The reserved produce stays with this buyer.                                        |
| Confirm sale | `expired`, `cancelled` (or `payment_failed`) | The order becomes paid and the produce is reserved for this buyer again, if enough is left in the listing. |
| Void order   | `pending_payment`                            | The order is cancelled and the reserved produce goes back to the listing.                                  |
| Void order   | `expired`, `cancelled` (or `payment_failed`) | The order is cancelled. The produce was already released, so the listing does not change.                  |

Every effect adds: "The payment record stays as it is. Any refund must be handled outside
AgriSence." AgriSence runs in the M-Pesa sandbox and has no refund or reversal API; a real refund
would be an M-Pesa operation by the merchant, outside the platform, so the console records the
decision and leaves the payment record untouched.

**Records.** The answer carries a `resolution` (action, note, administrator name, time), shown read
only on the order from then on. The payment rows and their events are never changed.

**Errors.** `order_not_in_reconciliation` (someone else resolved it) closes the dialog, refetches
the order and says "This order is no longer waiting for review." `reconciliation_context_missing`
and `insufficient_stock_to_confirm` keep the dialog open with their message. After a timeout or a
network failure the dialog says "We could not confirm whether the change was saved. Refresh this
order to check before trying again." with a "Refresh order" button; the request is never resent
automatically. Both buttons are disabled while a request is pending, and a double click sends one
request.

## Number entered (identity v2, prompt 2)

The buyer now types the M-Pesa number for each payment. The payments list and the payments table
of the order detail show it in the column "Number entered" (`phone_masked`, masked by the server to
the last three digits), next to "Phone (masked)", the number the prompt went to
(`stk_target_masked`). They differ in a test environment, where every prompt goes to a fixed
sandbox number. Payments from before the change have no entered number and read "Not recorded".
The stacked cards show the same value (the columns are declared once in `ResponsiveTable`).

## Privacy

- Administrators may see the full name and email of every account, on the users screen only.
  Accounts and invitations have no phone number. The only phone numbers in the console are the
  payment fields, as the server's masked values (`phone_masked`, `stk_target_masked`); invitations
  show `email_masked`.
- Searches typed by an administrator (a name or an email) are never put in a
  query key: the key holds an opaque id (`searchKey`). They do appear in the URL of the users screen
  (`?q=`), like every other filter, so a bookmarked search is shareable by the administrator only.
- Payment event payloads were redacted by the backend when stored but are treated as untrusted
  text: `PayloadView` shows them as indented JSON inside a `pre`, escaped by React (a payload
  containing `<script>` shows the characters), never as HTML. Payloads over 16 KB are shortened
  until "Show all". The copy button copies exactly the payload text.
- No screen shows or asks for a password, a code or a token. The invitation code is sent only to
  the invited person's email; the console offers only the accept invitation page address
  (`<origin>/accept-invite`, which holds no secret) to copy, with "Share this address only. The code
  arrives by email and is never shown here." A response that carried a code would still not be
  rendered: the screens render named fields only.
- Images go through `safeImageUrl` (https, or localhost in development).

## Invitation and email check flows

1. "Send invitation" opens a form with the full name and the email (required, because the code goes
   there). The body is exactly `{name, email}`. `POST /admin/invites` answers 201 with the masked
   email and `email_sent`.
2. `email_sent: true` shows "Invitation sent to <masked email>. The person receives an 8 character
   code and chooses their own password." `false` shows "The invitation was created but the email
   could not be sent. Use Resend, or check email settings."
3. The person opens `/accept-invite`, enters the emailed code and chooses a password. The answer
   signs them in directly (no sign in code: the invite code proved the email; see `docs/auth.md`).
4. Resend sends a new code, then waits 60 seconds; a 429 `resend_cooldown` counts down from
   `Retry-After` (60 without it). `send_limit_reached` explains that the invitation should be
   revoked and recreated. Revoke asks first. A locked invitation (too many wrong codes) says
   "Locked after too many wrong codes. Revoke it and send a new invitation." and offers Revoke.
5. "Check email delivery" sends a test message to the main administrator's own address. A 502
   `email_failed` carries a `category` in the error object (`ApiError.extra.category`), shown as:
   `connection_timeout` "The mail server could not be reached. The network or the hosting provider
   may block mail ports.", `auth_failed` "The mail server rejected the sign in details.",
   `tls_failed` "A secure connection to the mail server could not be made.", `recipient_refused`
   "The mail server refused the recipient.", `other` "The email could not be sent."

## Forecast accuracy

Summary cards (one per horizon and source in the response) show the compared and pending counts,
the average percentage error (MAPE), the average error in KES per kg, how often the direction was
right, and how often the forecast beat "the price stays the same" (persistence). Missing values
read "Not enough data". `openapi.json` gives these fields no unit; the console reads `mape` and
`pct_error` as percentages and `directional_accuracy` and `beat_persistence_rate` as shares between
0 and 1 (`src/lib/accuracyFormat.js`, one place to change). "What these mean" explains each measure,
states that backfilled forecasts were computed afterwards from the prices available at the time and
were never shown live, and that the samples are small so the figures are indicative. The API's
`note` is shown as it is. The table shows pending forecasts with "Pending".

## Accessibility

- Every screen has an `h1` that receives focus on navigation, labelled filters, and status as an
  icon plus a word (never colour alone); orders needing review add the words "Needs review".
- Chips are native radio groups (Tab to the group, arrow keys to choose); the "Include pending"
  control is a checkbox with `role="switch"`.
- `ResponsiveTable` renders a real table with a caption and row headers from 1280 px (next to the
  sidebar the content area is at most about 990 px wide; cell text wraps so the table fits) and
  the same rows and actions as a list of cards below, two per row from 768 px, so nothing scrolls
  sideways on a phone or tablet. Only one
  layout is in the page, so each action exists once.
- Action buttons name their target for screen readers ("Disable Wanjiku Kamau", "Revoke Pending
  Person", "View events for order AGR-…").
- Dialogs trap focus, return it to the button that opened them (or to the page heading, or the
  Resolution heading after a decision, when that button is gone), show errors in an alert region
  and keep 44 px targets.
- The review count badge is hidden from screen readers and replaced by "N orders need review" in
  the link's name.
- axe runs on every admin screen in its loading, empty, error and success states (cards and
  table), and with each dialog open (`src/screens/admin/admin.a11y.test.jsx`).

## Limitations

- No audit log beyond what the backend stores: the order resolution, the created by and disabled
  by names, and the payment events. The console cannot list who did what over time.
- No export (CSV or PDF) of any list.
- No accuracy chart: the accuracy screen has cards and a table only. A chart of forecast against
  published price per month is a possible extension; it would reuse the lazily loaded Recharts
  chunk of the farmer screens.
- Accuracy figures come from small samples and are indicative only; the units of the summary
  fields are not documented in `openapi.json` (see above).
- Listing, order and payment times are shown as real dates and times in Nairobi time
  (`formatDateTime`, `formatMonth`), unlike the farmer price and forecast screens, which use
  relative time only.
- Lists refresh on window focus and with "Refresh"; there is no live update or polling, so a
  payment that completes while the screen is open appears only after a refresh.
- `GET /admin/payments` takes `created_from` and `created_to` as dates; `openapi.json` does not say
  in which time zone the server reads them, so the screen labels them "Dates as interpreted by the
  server (whole days)".
- The search parameters are sent as typed (2 to 50 characters; 6 to 12 for an order reference).
  What `q` matches on the listings route is not documented; the screen labels it "Search by farmer".
- Revoking a locked invitation is offered because its message tells the administrator to revoke
  it; the server is the authority if it refuses.
