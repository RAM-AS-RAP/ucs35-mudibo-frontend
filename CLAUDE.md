# CLAUDE.md: guide for AI coding assistants

## 1. Project

AgriSence frontend (`ucs35-mudibo-frontend`): a React single page application and installable PWA.
It is part of a thesis on SHAP explainable crop price forecasting and farmer to buyer linkage for
smallholder farmers in Kenya; payments run in the Safaricom M-Pesa sandbox only (no real money).
The backend is a separate, finished repository; its contract is copied into `docs/backend/`.

Roles: `farmer` (prices, forecasts, listings, orders on their listings), `buyer` (browse, order, pay),
`admin` (moderation, users, orders, payments, forecast accuracy; the super admin also manages invites).

| Module | Scope                                                                                                     | Status      |
| ------ | --------------------------------------------------------------------------------------------------------- | ----------- |
| F0     | Foundation: scaffold, tooling, API layer, session, guards, shells, design system, PWA shell, tests, docs  | Done        |
| F1     | Authentication: login, register, password change and reset, accept invite, session handling               | Done        |
| F2a    | Farmer decision support: dashboard, prices, price trends, forecast with SHAP bars (relative time only)    | Done        |
| F2b    | Farmer: listings (image upload, create, edit, delete), orders on my listings                              | Done        |
| F3     | Buyer: browse, listing detail, checkout, M-Pesa payment polling, my orders                                | Done        |
| F4-A   | Follow-up: `is_super_admin` and user id in the session, edit via `GET /listings/mine/{id}`, buyer markets | Done        |
| F4     | Admin: dashboard, users, invites, moderation, orders, payments, reconciliation, accuracy                  | Done        |
| F5     | Polish: end to end tests (Playwright), performance, accessibility review                                  | Not started |

Update this table at the end of every module.

## 2. Stack and commands

Node 24 LTS (`.nvmrc`), npm. JavaScript only (`.js`, `.jsx`), no TypeScript source files.

| Package                   | Version | Package                                           | Version                       |
| ------------------------- | ------- | ------------------------------------------------- | ----------------------------- |
| react, react-dom          | 19.3.1  | vite                                              | 8.3.4                         |
| react-router              | 8.4.0   | @vitejs/plugin-react                              | 6.1.2                         |
| @tanstack/react-query     | 5.104.3 | tailwindcss, @tailwindcss/vite                    | 4.3.3                         |
| openapi-fetch             | 0.17.0  | tw-animate-css                                    | 1.4.0                         |
| radix-ui                  | 1.8.1   | vite-plugin-pwa                                   | 2.0.0 (workbox 7.4.1)         |
| class-variance-authority  | 0.7.1   | @vite-pwa/assets-generator                        | 2.0.0                         |
| clsx                      | 2.1.1   | openapi-typescript                                | 7.13.0                        |
| tailwind-merge            | 3.7.0   | typescript (types only)                           | 5.9.3                         |
| lucide-react              | 1.57.0  | vitest                                            | 5.0.5                         |
| sonner                    | 2.0.8   | jsdom                                             | 29.1.1                        |
| workbox-window            | 7.4.1   | @testing-library/react, dom, jest-dom, user-event | 16.3.3, 10.4.2, 7.0.1, 14.6.8 |
| eslint, @eslint/js        | 9.39.5  | msw                                               | 3.0.3                         |
| eslint-plugin-react       | 7.37.5  | axe-core                                          | 4.14.0                        |
| eslint-plugin-react-hooks | 7.1.1   | ajv                                               | 8.20.0                        |
| eslint-plugin-jsx-a11y    | 6.10.2  | prettier                                          | 3.9.10                        |
| globals                   | 17.13.0 | react-hook-form                                   | 7.90.0                        |
| zod                       | 4.6.7   | @hookform/resolvers                               | 5.9.1                         |
| recharts                  | 3.10.1  |                                                   |                               |

Version and dependency decisions:

- **ESLint 9, not 10:** `eslint-plugin-react` and `eslint-plugin-jsx-a11y` declare peer support up to ESLint 9.
  Move to 10 when both support it.
- **TypeScript 5, not 7:** `openapi-typescript` 7 requires `typescript ^5`. TypeScript is used only for
  type generation and editor checking of JSDoc (`checkJs`), never for source files.
- **jsdom 29, not 30:** jsdom 30 requires Node 24.15 or newer; 29 works on every Node 24 release.
- **axe-core directly** (`src/test/axe.js`) instead of `vitest-axe`, which has not been maintained since 2022.
- **shadcn/ui runtime packages** (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`,
  `lucide-react`, `sonner`, `tw-animate-css`) are what the shadcn components need. The shadcn CLI downloads
  from ui.shadcn.com, which F0's network rules did not allow, so the components were written by hand from
  the shadcn sources. `components.json` is set up for JavaScript if you want to use the CLI later.
- **workbox-window**: needed by `virtual:pwa-register/react`.
- **react-hook-form, zod, @hookform/resolvers** (F1): form state, schema validation and the bridge
  between them for the auth forms (named in the F1 task). Together with the auth screens and the
  dropdown menu they raised the initial JavaScript from 149.9 kB to 212.6 kB gzip (budget 250 kB).
- **Dropdown menu** (F1, account menu): `src/components/ui/dropdown-menu.jsx`, from `radix-ui` (no new package).
- **recharts** (F2a, named in the F2a task): the price trend chart only. It is imported only by
  `src/components/display/TrendChartCanvas.jsx`, which `TrendChart` loads with `React.lazy`, so it is a
  separate lazy chunk (99.5 kB gzip) and never in the initial JavaScript (216.1 kB gzip after F2a).
  Its peer `react-is` was not installed separately (the task allows only the named packages): npm
  satisfies the peer range with the `react-is@17.0.2` already in the tree. That version does not
  recognise React 19 elements for `isFragment`, so never pass a Fragment as a child of a Recharts
  component. Add `react-is` matching React (19.x) if that becomes a problem.
- The explanation bars are not drawn with Recharts (see `docs/forecast-display.md`).
- **F2b added no dependency.** The photo helper uses the browser canvas API; money arithmetic uses
  BigInt; the confirmation dialogs reuse `src/components/ui/dialog.jsx`. Initial JavaScript after F2b:
  222.2 kB gzip (5 files); the photo helper is its own lazy chunk (0.9 kB gzip).
- **F3 added no dependency.** Idempotency keys use `crypto.randomUUID` (with a
  `crypto.getRandomValues` fallback); the estimate uses BigInt. Initial JavaScript after F3:
  224.5 kB gzip (6 files; the +2.3 kB is the navigation badge's count hook); the buyer screens are
  lazy chunks of 1.5 to 4.5 kB gzip each.
- **F4 added no dependency.** Tables and cards, dialogs, the payload view and the clipboard use
  React, `radix-ui` and the browser. Initial JavaScript after F4: 226.4 kB gzip (7 files; the
  +1.8 kB is the review count badge and its endpoint function); the admin screens are lazy chunks
  of 1.5 to 3.6 kB gzip each, plus a shared 7.6 kB chunk (`ResponsiveTable` with the admin text).

```bash
npm ci                    # install exactly from package-lock.json
npm run dev               # dev server (needs .env with VITE_API_BASE_URL)
npm run build             # production build in dist/
npm run preview           # serve dist/
npm run lint              # ESLint (react, react-hooks, jsx-a11y; react/no-danger is an error)
npm run format            # Prettier
npm test                  # Vitest, run mode
npm run gen:types         # docs/backend/openapi.json -> src/api/schema.d.ts
npm run gen:icons         # public/favicon.svg -> PWA icons in public/
npm run check:contract    # schema.d.ts current, endpoint paths and methods exist in openapi.json
npm run check:build       # after build: manifest, no runtime caching, no dev code, JS budgets, lazy Recharts, photo helper, buyer and admin screens
```

## 3. Structure and conventions

```
src/
  screens/      auth/, farmer/, buyer/, admin/, shared/   one screen per file, default export, *Screen.jsx
  components/   ui/ (shadcn), layout/, feedback/, display/, listings/, orders/, buyer/, admin/   named exports
  api/          client.js, errors.js, endpoints/<area>.js, schema.d.ts (generated, do not edit)
  auth/         session.js, guards.jsx, roles.js, paths.js, auth.js (signIn, signOut, sign in hold),
                useAuth.js, redirects.js, revalidate.js
  api/queries/  TanStack Query hooks (useMarkets, useCurrentPrices, usePriceTrends, useForecast; listings.js:
                useMyListings, useMyListing, useMyOrders, counts, useCreate/Update/RemoveListing; buyer.js:
                useBrowseListings, useBuyerMarkets, useListing, useOrder, useMyBuyerOrders, useCreate/Pay/CancelOrder;
                waitingCount.js: useWaitingOrdersCount; admin.js: useAdminStats, useAdminUsers, useAdminInvites,
                useAdminListings, useAdminOrders, useAdminOrder, useAdminPayments, usePaymentEvents,
                useForecastAccuracy and one mutation per write; reviewCount.js: useReviewCount), keys.js, policy.js
  components/admin/  ResponsiveTable, FilterBar (useFilterParams), SearchInput, ConfirmDialog, PayloadView,
                PaymentEventsDialog, RoleBadge, ListParts (RefreshButton, ShowingCount, LoadMore, pagesOf)
  components/auth/  AuthLayout, FormField, PasswordField, CodeInput, FormErrorSummary, CountdownButton,
                PasswordRequirements, SignedInNotice, ResendCode, FormNotices, useServerProblem
  lib/          env.js, format.js, queryClient.js, utils.js, validation.js, messages.js, formErrors.js,
                connectivity.js, useCountdown.js, usePageTitle.js, useReducedMotion.js,
                relativeTime.js, forecast.js, shapSchema.js, trends.js (F2a),
                decimal.js, priceCheck.js, image.js, safeImageUrl.js (F2b),
                constants.js, orderTotals.js, idempotency.js, orderView.js, polling.js, payErrors.js,
                filterParams.js, buyerMessages.js (F3),
                adminMessages.js, reconciliation.js, userActions.js, accuracyFormat.js, dateRange.js,
                clipboard.js, useMediaQuery.js (F4)
  styles/       tokens.css (all colours), index.css
  dev/          DevRoleSwitcher.jsx (development only)
  test/         setup.js, msw/, fixtures/, helpers (render, axe, openapi, contrast, buyer, admin)
  App.jsx, main.jsx, routes.jsx (the single route table)
scripts/        check-contract.mjs, check-build.mjs, tokens.mjs
docs/           backend/, architecture.md, auth.md, design-system.md, forecast-display.md,
                listings-orders.md, buyer-checkout.md, admin-console.md, security-headers.md
```

- Import with the `@/` alias (`@/api/endpoints`). Tests sit next to the code as `*.test.js(x)`.
- Types come from `schema.d.ts` through JSDoc:
  `/** @param {import('@/api/schema').components['schemas']['OrderOut']} order */`.
- Role areas are lazy loaded in `routes.jsx`; keep role specific code under its role folder.

## 4. API rules

- Every backend call is a function in `src/api/endpoints/<area>.js` using `api` from `src/api/client.js`,
  called from TanStack Query hooks. Screens never call `fetch`.
- Use literal paths from `openapi.json` (`api.GET('/api/v1/orders/{order_id}', { params: { path: { order_id } } })`).
- **Base URL rule:** the OpenAPI paths already include `/api/v1`, so `VITE_API_BASE_URL` is the API origin
  only (`http://localhost:8000`, no trailing slash, https except localhost). A test asserts the health URL is
  exactly `http://localhost:8000/api/v1/health`.
- Errors: the client throws `ApiError` (`status`, `code`, `message`, `reason`, `requestId`, `retryAfter`, `fields`,
  `details`). Branch on `code`, show `getUserMessage(error)` and the "Reference" from `getUserMessageDetails`.
  New backend codes go into `ERROR_MESSAGES` in `src/api/errors.js`.
- Contract workflow: copy `openapi.json` and `frontend_contract.md` into `docs/backend/` (see
  `docs/backend/README.md`), run `npm run gen:types`, then `npm run check:contract` and `npm test`.
- **isSuperAdmin comes from the backend user object and only controls UI visibility:** read it only
  from `is_super_admin` in the login response (`TokenResponse`) and in `/auth/me` (`UserOut`); only
  `true` counts. Never infer it from any other endpoint, and never probe the (rate limited) invite
  routes. The session also keeps the user `id` from `/auth/me` (`userId`).
- The backend is the single authority for roles, prices, totals, stock and order state. Show `can_pay` /
  `can_cancel` and server totals as returned; never recompute them.

## 4a. Prices and forecasts conventions (F2a, details in `docs/forecast-display.md`)

- Hooks in `src/api/queries/`: `staleTime` 5 minutes, no retry on 4xx, at most 2 retries on network
  errors, timeouts and 5xx (`policy.js`). Keys (`keys.js`) hold only market, crop, horizon and months.
- **`getForecast()` returns a result, not only data:** `{ status: 'ok', data }` or, for 404
  `forecast_unavailable` only, `{ status: 'unavailable', reason: 'no_forecast' | 'stale' }`. Every other
  error (including 404 `market_not_available`) throws `ApiError`. Never show an older forecast.
- **Explanation shape:** draw the SHAP bars from the backend's `shap_values` whenever `parseShap()`
  (`src/lib/shapSchema.js`, Zod schema) accepts it; otherwise keep the price and show the fallback
  message. There is no reconciliation against the headline: the backend rounds the top level
  `predicted_log_change` to 2 decimals, and the ML pipeline already checks the sum before storing.
- **Relative time only** on the farmer price, trend and forecast screens: no month name, year, date or
  "updated" time anywhere a person can read or hear it (including `aria-label`, the title and the URL).
  Use `src/lib/relativeTime.js` ("Latest", "3 months ago", "In 1 month", "1 month older"); never
  `formatMonth`, `formatDateTime`, `new Date(` or `Intl.DateTimeFormat` in the files listed in
  `RELATIVE_ONLY` in `src/test/source.test.js` (the price, trend, forecast and dashboard price files,
  the F2a display components and `PriceGuidance`). The listing and order files may use
  `formatDateTime`. Add a new price or forecast file to that list. Do not display the backend's
  `as_of_note`.
- **Wording:** describe how the model reached a forecast, never a cause of real price movements; "the
  model expects", never "will"; no guarantees; plain English. Explanation steps carry a triangle
  (▲ or ▼) and a plus or minus sign next to the colour (down steps hatched); no Boost, Drag or
  "No effect" words.
- Derived values are display only: the 90 kg bag price, the KES per step of the explanation
  staircase (the server's KES change shared out by log contribution, `explainabilityChart`), the
  summary sentence. Everything else is the server's number.
- **Chart tokens** `chart-1` to `chart-4` in `tokens.css`, used through `var(--chart-N)`; series also
  differ by line style and end labels.
- **Lazy chart rule:** only `TrendChartCanvas.jsx` imports Recharts, and only through `React.lazy`.
  `npm run check:build` fails if Recharts reaches the initial JavaScript or a lazy chunk exceeds 250 kB gzip.
- Screen selections live in the URL query string (validated, invalid values removed); `usePageTitle`
  moves focus to the heading on a pathname change only, not on a query string change.

## 4b. Listings and orders conventions (F2b, details in `docs/listings-orders.md`)

- **Multipart only in the API layer:** `buildListingForm` in `src/api/endpoints/listings.js` builds
  every `FormData` from a plain object (allowed names only, defined values only, decimals as strings,
  never `unit`, `status` or `farmer_id`) and sends it with an identity body serializer and no
  `Content-Type`, so the browser sets the boundary. A source check keeps `new FormData(` in `src/api/`.
- **Never retry a write:** create, edit and remove use `useMutation` with `writePolicy`
  (`retry: false`). After a timeout or network failure, say the result is unknown and link to My
  listings; never resend automatically. Guard every submit against a double click.
- **Money:** parse typed decimals with `parseDecimalInput`, send them as strings, compute display
  estimates with `multiplyMoney` (BigInt, half up), compare with `sameDecimal`. Never do floating point
  arithmetic on money; show server amounts (`total_amount`) as returned.
- **Images:** render every `image_url` through `safeImageUrl` (https, or localhost in development).
  Prepare uploads with `prepareImage` (`src/lib/image.js`), loaded only with a dynamic import; only it
  and `PhotoPicker` create object URLs, and both revoke them.
- **Status words** for listings and orders live in `LISTING_STATUS_WORDS` and `ORDER_STATUS_WORDS`
  (`src/lib/messages.js`) and are shown through `StatusBadge` (`kind="listing"` for listings).
- One of the farmer's listings: `useMyListing(id)` (a cached page first, then
  `GET /listings/mine/{id}`; a 404 `listing_not_found` gives `null`). The edit screen then goes back
  to My listings. Never call the buyer's `GET /listings/{id}` from farmer code (403).
- Never show or request a buyer contact detail.

## 4c. Buyer checkout and payment conventions (F3, details in `docs/buyer-checkout.md`)

- Endpoints: `endpoints/buyerListings.js` (`browseListings`, `getListing`, `getBuyerMarkets`), `endpoints/orders.js`
  (`createOrder`, `getOrder`, `getMyOrders` exported from the index as `getMyBuyerOrders`,
  `cancelOrder`, `existingOrderId`), `endpoints/payments.js` (`payOrder`). The farmer's
  `getMyOrders` and `useMyOrders` keep their names; the buyer's are `getMyBuyerOrders` and
  `useMyBuyerOrders`.
- `ApiError.extra` holds every field of the error object that is not a named property (for
  example `existing_order_id`); read the open order with `existingOrderId(error)`.
- **Idempotency key:** only `payments.js` sets `Idempotency-Key`, only `lib/idempotency.js`
  creates keys, and the pay request has no body. One new key per deliberate click; keep the same
  key only after `network_error` or `timeout` (the button reads "Check payment request"); discard
  it on a 202 or any error with an HTTP status. The key lives in a `useRef` only, never in storage,
  a URL, router state, a query key or mutation variables (`usePayOrder(orderId, keyRef)`).
- **Server clock:** `useOrder` exposes `offsetMs = Date.parse(server_time) - dataUpdatedAt`;
  every remaining time goes through `remainingSecondsUntil`/`deriveOrderView` with it. Never count
  down on the device clock alone.
- **Polling constants** live in `lib/constants.js`: `POLL_INTERVAL_MS` 3000, `POLL_WINDOW_MS`
  150000; `nextPollInterval` decides. TanStack pauses the interval while the tab is hidden; polling
  stops on final states, on unmount and after a 4xx. Lists (browse, My orders) never poll.
- **Buttons follow the server:** `deriveOrderView` copies `can_pay` and `can_cancel`; never
  enable Pay or Cancel otherwise. The minimums in `lib/constants.js` only explain a disabled button.
- **Never retry order creation** (or pay, or cancel): `useMutation` with `writePolicy`, a ref guard
  against double clicks, and after a timeout or network failure only a link to My orders.
- The buyer files are not in the relative time list (`RELATIVE_ONLY`): they may use
  `formatDateTime` (the source check allows `components/buyer/` and `screens/buyer/`).
- Buyers get 403 from prices, forecasts and `GET /markets`: never call them from buyer code (a
  source check and every buyer screen test enforce it). The browse market filter offers exactly the
  names from `GET /listings/markets` with their counts (`useBuyerMarkets`, stale after 2 minutes);
  a URL market is kept until the list loads, then removed when it is not on it; when the list fails
  only "All markets" is offered.
- Buyer screen text lives in `lib/buyerMessages.js`; order and payment status words in
  `lib/messages.js` (`ORDER_STATUS_WORDS`, `PAYMENT_STATUS_WORDS`) through `StatusBadge`.
- Never ask for, show or store an M-Pesa PIN; `SandboxNote` shows the PIN warning. Show only the
  masked prompt target (`stk_target_masked`).

## 4d. Administrator conventions (F4, details in `docs/admin-console.md`)

- Endpoints in `endpoints/admin.js`, hooks in `queries/admin.js` (the shell's review count in
  `queries/reviewCount.js`). Reads refetch on window focus and never poll; lists are infinite
  queries of 20 with "Showing X of Y" and "Load more"; every screen has a Refresh button.
- **Writes are never retried automatically:** each write is a `useMutation` with `writePolicy`, a
  guard against double clicks, and after a timeout or network failure the message that the result is
  unknown, with a way to refresh (`WRITE_UNKNOWN`, `isUnknownWriteResult` in `lib/adminMessages.js`).
- **Destructive actions use `ConfirmDialog`** (`components/admin/`): disable or enable a user,
  revoke an invitation, remove a listing, resolve an order (with a required 10 to 500 character
  note). The resolve body is exactly `{action, note}`.
- **Payloads are displayed as text only**, through `PayloadView` (React escaped, inside `pre`).
- **The UI hides actions but the server decides:** `canToggleUser` and `RequireSuperAdmin` only shape
  what is shown; map the server's 403 and 409 answers with `adminErrorMessage()` and refresh.
- **Administrator screens may show real dates** (`formatDateTime`, `formatMonth`); they are not in
  `RELATIVE_ONLY`, which stays as it is.
- Lists use `ResponsiveTable` (table from 1280 px, cards below and two per row from 768 px;
  a table wider than its space shows the cards; columns declared once) and keep their filters in
  the URL with `useFilterParams`. Search texts go into query keys only as `searchKey()` ids.
- Show amounts, counts and accuracy figures as the server returns them; missing accuracy values read
  "Not enough data" (`lib/accuracyFormat.js`). Never show or ask for a password, code or token on an
  admin screen; the invite screen copies only `<origin>/accept-invite`.
- Admin text lives in `lib/adminMessages.js`; status words in `lib/messages.js`
  (`ADMIN_ORDER_STATUS_WORDS`, `ADMIN_PAYMENT_STATUS_WORDS`, `INVITE_STATUS_WORDS`,
  `USER_STATUS_WORDS`) through `StatusBadge`.

## 5. Security rules

- The token lives only in the session store (`src/auth/session.js`, persisted to `sessionStorage`).
  Never put it in `localStorage`, a URL, a log line or a query key.
- Never render raw HTML (`dangerouslySetInnerHTML` is a lint error and a test failure). No `eval`.
- No third party scripts, fonts, CDNs or analytics. No secrets in this repository (only the public API address).
- Any 401 outside the public auth routes logs out (handled in the client middleware).
- The dev role switcher's fake session never carries a token and never ships in production.

## 5a. Authentication conventions (F1, details in `docs/auth.md`)

- Sign in through `signIn()` / `useAuth().login` (`src/auth/auth.js`): login, `setFromLogin`, then `getMe`
  and `setProfile`. Sign out through `useAuth().logout` or `signOut()`; there is no logout endpoint.
- **Credentials never go through TanStack Query.** Auth forms call the endpoint functions from their submit
  handlers; `useMutation` would keep the password in the mutation cache. A source check enforces this for
  `src/screens/auth/`. Never auto fill a password: `PasswordField` takes no `value` or `defaultValue`.
- **Flash messages:** `clear(reason)` and `setFlash()` leave one in memory message for the login screen,
  which consumes it. Add new texts to `src/lib/messages.js`.
- **Redirects:** after sign in always go through `getPostLoginPath()` (`src/auth/redirects.js`); never
  navigate to a path taken from router state or the URL without it. Wrap a sign in with `useSignInHold()`
  so `PublicOnly` does not redirect before the screen does.
- **Resend cooldown:** every "send a new code" control waits 60 seconds after a send (`ResendCode`), and
  every 429 disables the action for `Retry-After` seconds (60 without the header).
- Forms: Zod schema in `src/lib/validation.js`, server errors through `useServerProblem` (focus to the
  summary, 422 fields mapped with `src/lib/formErrors.js`), `SubmitButton` for pending and countdown.
- A session restored from `sessionStorage` is revalidated with `GET /auth/me` before protected routes
  render (`src/auth/revalidate.js`); a fresh login is not.
- Public auth routes (`PUBLIC_AUTH_PATHS` in `src/api/client.js`) never send `Authorization`.

## 6. UI rules

- Colours only through tokens (`src/styles/tokens.css`); no hex colours elsewhere in `src/`.
- Never colour alone: pair it with an icon or sign and a word (`DeltaTag`, `StatusBadge`); the forecast
  explanation steps use a triangle, a sign and hatching instead of a word.
- Touch targets at least 44 by 44 px; phone first, no horizontal scroll at 360 px; inputs at 16 px or more.
- English only. Keep user facing strings in `src/lib/messages.js` (auth screens), the component, or
  `src/api/errors.js` (backend codes) so they are easy to find.
- Money and dates only through `src/lib/format.js` (KES, Africa/Nairobi time).

## 7. PWA rules

- The service worker precaches the build's static files only, with `index.html` as navigation fallback.
- Never add `runtimeCaching` or cache API responses or images anywhere (stale prices mislead; account data
  is private). `npm run check:build` enforces this.

## 8. Testing rules

- Every screen gets an axe test (`expectNoAxeViolations` from `src/test/axe.js`) and an MSW backed behaviour test.
- MSW handlers live in `src/test/msw/handlers.js`; fixtures in `src/test/fixtures/` must be registered in
  `FIXTURE_CONTRACT` so `src/test/contract.test.js` validates them against `openapi.json`.
- Keep the source checks (`src/test/source.test.js`) and the contrast test passing.
- On machines with little free memory run `npx vitest run --pool=threads --maxWorkers=1`.

## 9. Definition of done (per module)

`npm run lint`, `npm run check:contract`, `npm test`, `npm run build` and `npm run check:build` all pass;
the docs and the status table above are updated; no TODO is left without an entry in the README's
"Open items" section.

## 10. Do not

- Add a dependency without recording it and the reason in section 2.
- Bypass the API layer, or call an endpoint that is not in `openapi.json`.
- Weaken a check, a test or a lint rule to make it pass.
- Commit `.env` or any secret, or add deployment or hosting configuration without being asked.
