# ucs35-mudibo-frontend

## Project Title: SHAP-based explainable decision support system for crop price prediction and farmer-buyer linkage among smallholder farmers in Kenya

### Name: Sean Mudibo

### Adm No: 168329

### Capstone Project (Webmasters Kenya)

- ML repository: https://github.com/RAM-AS-RAP/ucs35-mudibo-ml
- Backend repository: https://github.com/RAM-AS-RAP/ucs35-mudibo-backend

The AgriSence web app: crop price forecasts with SHAP explanations and a farmer to buyer marketplace
for smallholder farmers in Kenya. It is a React single page application, installable as a PWA, that
talks to the AgriSence backend API (a separate repository). Payments use the M-Pesa sandbox only.

Current state: modules F0 (foundation), F1 (authentication), F2a (farmer decision support), F2b
(farmer listings and orders) and F3 (buyer browse, checkout and M-Pesa payment) are done. The admin
screens (F4) are a placeholder that a later module replaces. See [CLAUDE.md](CLAUDE.md) for the
roadmap and status.

## Requirements

- Node.js 24 LTS (see `.nvmrc`; `nvm use` picks it up) and npm 10 or newer.
- The backend running locally or reachable over https, for anything beyond the placeholder screens.

## Setup and run

```bash
npm ci
cp .env.example .env      # then edit VITE_API_BASE_URL if your API is not on localhost:8000
npm run dev               # http://localhost:5173
```

In development a small "Dev: role preview" control (bottom right) opens the farmer, buyer, admin or
super admin shell with a fake in memory session, without a backend login. It never sends a token and
is not included in production builds.

## Authentication

Farmers and buyers create their own accounts (`/register`, an explicit farmer or buyer choice) and sign
in with a phone number or email (`/login`). Administrators join through an emailed invitation code
(`/accept-invite`). People with an email address can reset a forgotten password with an emailed code
(`/forgot-password`, then `/reset-password`). A required password change (`/change-password`) blocks every
other screen until it is done; a voluntary one is in the account menu. Any password change signs the user
out, because the backend revokes older tokens. Sessions last 60 minutes, live only in this tab's
`sessionStorage`, and are checked with `GET /auth/me` when the app reopens. Details, error messages and
redirect rules: [docs/auth.md](docs/auth.md).

## Farmer screens (F2a)

- **Dashboard** (`/farmer`): the latest maize and beans prices in every market with the change against
  the month before, a one month forecast snapshot for the first market, and a summary of active
  listings and paid orders.
- **Prices** (`/farmer/prices`): a price card per market (price per kg, about the price of a 90 kg bag,
  change, and a "1 month older" tag when a market's latest price lags), and a price trend chart for
  the selected markets over 12, 24 or up to 60 months, with a data table as its text alternative.
- **Forecast** (`/farmer/forecast`): the predicted price in 1 and 2 months for a market and crop, a
  recommendation that leaves the decision to the farmer, and "Why the model expects this": the
  model's SHAP explanation as Boost and Drag bars, shown whenever the backend's explanation has the expected shape.
  A "Plan a listing" button leads to the listing form with the crop and market filled in.
- These screens never show calendar dates: time is counted in months before the latest published
  price ("3 months ago", "In 1 month"). Selections are kept in the URL so a view can be bookmarked.
  Details: [docs/forecast-display.md](docs/forecast-display.md).

## Farmer listings and orders (F2b)

- **My listings** (`/farmer/listings`): the farmer's listings by status (All, Active, Sold out,
  Removed), 20 at a time, with Edit, Remove (after a confirmation) and View orders.
- **New listing** (`/farmer/listings/new`) and **Edit listing** (`/farmer/listings/:id/edit`): crop,
  market, quantity available now, asking price per kg and an optional photo, with price guidance, an
  estimate, and a check that asks the farmer to confirm a price far from the latest market price
  (a price per bag typed as per kg). Photos are resized and re-encoded as JPEG in the browser, which
  also removes their location data. Edit sends only the fields that changed. Writes are never retried
  automatically.
- **Orders** (`/farmer/orders`): orders on the farmer's listings with status filters, a filter for one
  listing, Load more and Refresh. Payments are M-Pesa sandbox confirmations; no buyer contact detail
  is shown; delivery is agreed outside the platform.
- Details: [docs/listings-orders.md](docs/listings-orders.md).

## Buyer screens (F3)

- **Browse produce** (`/buyer/browse`, also the buyer home `/buyer`): active listings with stock,
  20 at a time, filtered by crop, market and price per kg and sorted by newest or price. Filters
  are kept in the URL. Each card shows the photo, crop, market, price per kg, quantity available
  and the seller's name.
- **Listing detail** (`/buyer/listings/:id`): the listing, a quantity stepper, an estimated total
  (labelled as an estimate; the server's total is the one charged) and "Continue to checkout". The
  produce is held for about 5 minutes after checkout. Order creation is never retried automatically.
- **Order and payment** (`/buyer/orders/:id`): the order with its reference, a countdown on the
  server's clock, "Pay with M-Pesa" (an STK prompt to the registered phone in the Safaricom
  sandbox), a waiting panel that checks the result every 3 seconds for up to 150 seconds, the
  result (paid, cancelled, failed, timed out, expired, under review) and "Cancel order". AgriSence
  never asks for an M-Pesa PIN: it is entered only on the phone prompt.
- **My orders** (`/buyer/orders`): the buyer's orders with status filters (All, Waiting for payment,
  Paid, Not paid, Under review), "Continue payment", Load more and Refresh. The navigation shows how
  many orders wait for payment.
- No real money moves, delivery is not part of the prototype, and the buyer sees only the seller's
  name. Details: [docs/buyer-checkout.md](docs/buyer-checkout.md).

## Scripts

| Script                   | What it does                                                                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`            | Vite dev server                                                                                                                                                                                                                                                       |
| `npm run build`          | Production build into `dist/`                                                                                                                                                                                                                                         |
| `npm run preview`        | Serve the production build                                                                                                                                                                                                                                            |
| `npm run lint`           | ESLint                                                                                                                                                                                                                                                                |
| `npm run format`         | Prettier                                                                                                                                                                                                                                                              |
| `npm test`               | Unit, component, accessibility and contract tests (Vitest)                                                                                                                                                                                                            |
| `npm run gen:types`      | Generate `src/api/schema.d.ts` from `docs/backend/openapi.json`                                                                                                                                                                                                       |
| `npm run gen:icons`      | Generate the PWA icons from `public/favicon.svg`                                                                                                                                                                                                                      |
| `npm run check:contract` | Fail if the generated types are stale or an endpoint path or method is not in the contract                                                                                                                                                                            |
| `npm run check:build`    | After a build: check the manifest, the service worker (no API caching), no dev code, no source maps, the initial JavaScript budget, the lazy chunk budget, and that Recharts, the photo helper and the buyer screens are only in lazy chunks; prints every chunk size |
| `npm run e2e`            | Placeholder: end to end tests arrive in F5                                                                                                                                                                                                                            |

## Environment variables

Only public values; this repository holds no secrets.

| Variable               | Example                 | Meaning                                                                                                                     |
| ---------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`    | `http://localhost:8000` | The API **origin**, without `/api/v1` and without a trailing slash. Must be https except for `localhost` and `127.0.0.1`.   |
| `VITE_SHOW_API_STATUS` | `false`                 | `true` shows the API and database health indicator on the login screen in a production build (always shown in development). |

**API prefix decision:** the paths in `docs/backend/openapi.json` already start with `/api/v1`
(for example `/api/v1/health`), so the base URL is the origin only and the final URL is
`http://localhost:8000/api/v1/health`. Adding `/api/v1` to the base URL would duplicate the prefix, so the
app rejects it at startup. If the environment is invalid the app shows a full page configuration error.

## Refreshing the backend contract

Copy `docs/openapi.json` and `docs/frontend_contract.md` from the backend repository into
`docs/backend/`, update `docs/backend/SOURCE.md`, then run `npm run gen:types`, `npm run check:contract`
and `npm test`. Details: [docs/backend/README.md](docs/backend/README.md).

## Folder structure

```
src/
  screens/      one file per screen: auth/, farmer/, buyer/, admin/, shared/
  components/   ui/ (shadcn/ui), layout/, feedback/, display/, listings/, orders/, buyer/
  api/          client.js, errors.js, endpoints/, queries/ (TanStack Query hooks), schema.d.ts (generated)
  auth/         session.js, guards.jsx, roles.js
  lib/          env.js, format.js, queryClient.js, utils.js, relativeTime.js, forecast.js, shapSchema.js, trends.js,
                decimal.js, priceCheck.js, image.js, safeImageUrl.js, constants.js, orderTotals.js,
                idempotency.js, orderView.js, polling.js, payErrors.js, filterParams.js, buyerMessages.js
  styles/       tokens.css (all colours), index.css
  dev/          development only role preview
  test/         test setup, MSW handlers, fixtures, helpers
scripts/        contract and build checks
docs/           backend contract, architecture, design system, security headers
public/         icons (placeholder leaf mark) and static files
```

## PWA scope

AgriSence can be installed on a phone's home screen, and its static files (the app shell) are cached so it
opens quickly. API responses are never cached, so prices, forecasts, listings and orders always come live
from the server; offline, the app only shows a message that a connection is needed.

## Documentation

- [CLAUDE.md](CLAUDE.md): conventions, rules and module status (also for AI assistants)
- [docs/architecture.md](docs/architecture.md): data flow, session and guards, errors, PWA caching
- [docs/auth.md](docs/auth.md): authentication flows, messages, redirect rules and limitations
- [docs/design-system.md](docs/design-system.md): tokens, usage rules, contrast ratios
- [docs/forecast-display.md](docs/forecast-display.md): what the farmer price and forecast screens show, the explanation shape check, wording and relative time rules
- [docs/listings-orders.md](docs/listings-orders.md): the listing and order screens, quantity and price rules, the photo pipeline, uncertain writes and limitations
- [docs/buyer-checkout.md](docs/buyer-checkout.md): the buyer screens, order and payment states, polling, the countdown, the idempotency key, the payment sequence, error messages and limitations
- [docs/security-headers.md](docs/security-headers.md): headers for the later deployment
- [docs/backend/](docs/backend/): the backend contract and how to refresh it

## Open items

- `public/favicon.svg` and the generated icons are a placeholder mark; replace with the final logo and run `npm run gen:icons`.
- Ask the backend team to add the frontend's development (`http://localhost:5173`) and production origins to `CORS_ORIGINS`.

## Known backend gaps

- backend gap: farmers cannot fetch a single listing. `GET /listings/{listing_id}` is the buyer's
  route and answers 403 to a farmer, so the edit screen reads the listing from the cached list or
  pages through `GET /listings/mine?limit=100` (at most 5 pages). A farmer route such as
  `GET /listings/mine/{listing_id}` would remove the lookup.
- backend gap: buyers cannot list markets, so the browse filter shows all four markets and some
  return no listings. `GET /markets` answers 403 to a buyer, so the filter uses the constant
  `BUYER_MARKETS` (Nairobi, Kisumu, Mombasa, Nakuru) in `src/lib/constants.js`. A buyer readable
  list of markets that have listings would remove the constant.
- backend gap: the KES 10 minimum order total is not in `openapi.json` or `frontend_contract.md`.
  The listing screen mirrors it (`MIN_ORDER_TOTAL_KES`) to explain a disabled button; the server's
  422 `order_too_small` decides.

## Troubleshooting

If `npm test` crashes with "out of memory" on a machine with little free RAM, run the tests in one worker:
`npx vitest run --pool=threads --maxWorkers=1`.
