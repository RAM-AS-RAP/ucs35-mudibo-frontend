# Design system

Light theme only (`color-scheme: light`). Phone first. Built with Tailwind CSS 4 and shadcn/ui
components written in JavaScript (`src/components/ui/`).

## Tokens

`src/styles/tokens.css` is the single source of every colour. Hex values are not allowed anywhere
else in `src/` (a source check test enforces this). `src/styles/index.css` maps the tokens to Tailwind
utilities (`bg-primary`, `text-positive-text`, `border-border`, ...) and removes Tailwind's default
palette, so only token colours exist. shadcn's semantic variables (`background`, `card`, `primary`,
`muted`, `destructive`, `ring`, ...) are defined in `tokens.css` as references to the tokens.
`vite.config.js` reads the same file for `theme-color` and the manifest colours.

| Token                                 | Value                     | Use                                                                     |
| ------------------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| `primary`                             | `#1B5E3B`                 | Brand and main actions (white text on it)                               |
| `primary-hover`                       | `#14482D`                 | Hover and pressed                                                       |
| `on-primary`                          | `#FFFFFF`                 | Text and icons on `primary`, the brand gradient and the sidebar         |
| `primary-soft`                        | `#E4F1E8`                 | Soft green tint: icon tiles, hover fills, the chart summary box         |
| `primary-deep`                        | `#0F3D26`                 | End of the brand gradient (hero banners, sign in panel)                 |
| `on-primary-muted`                    | `#D7EBDD`                 | Secondary text on the brand gradient and the sidebar                    |
| `accent-gold`                         | `#A16207`                 | Harvest gold accent (borders, icons), used sparingly                    |
| `accent-gold-soft` / `-text`          | `#FBF1D9` / `#854D0E`     | Gold icon tiles and pills; gold words                                   |
| `canvas`                              | `#F6F7F2`                 | Page background (warm off white)                                        |
| `sidebar`                             | `#0F3D26`                 | Navigation (sidebar and drawer), deep green with light text             |
| `card`                                | `#FFFFFF`                 | Cards and panels                                                        |
| `text`                                | `#1C1917`                 | Headings, body, large numbers (warm stone neutrals)                     |
| `text-secondary`                      | `#57534E`                 | Labels and secondary text                                               |
| `border`                              | `#E0DDD5`                 | Subtle borders                                                          |
| `neutral-bg` / `neutral-text`         | `#F1EFEA` / `#44403C`     | Neutral tags (for example a 0.0% delta)                                 |
| `positive`                            | `#16A149` (was `#16A34A`) | Positive icons and chart outlines                                       |
| `positive-soft`                       | `#86EFAC`                 | Positive chart bar fill                                                 |
| `positive-text`                       | `#157F3D` (was `#15803D`) | Positive text such as "+4.5%"                                           |
| `negative`                            | `#DC2626`                 | Negative icons and chart outlines                                       |
| `negative-soft`                       | `#FCA5A5`                 | Negative chart bar fill                                                 |
| `negative-text`                       | `#B91C1C`                 | Negative text                                                           |
| `chart-1`                             | `#1B5E3B`                 | First chart series (primary green), solid line                          |
| `chart-2`                             | `#B45309`                 | Second chart series (amber), dashed line                                |
| `chart-3`                             | `#6D28D9`                 | Reserved: third series (violet), dotted line                            |
| `chart-4`                             | `#0E7490`                 | Reserved: fourth series (teal), dash dot line                           |
| `focus-ring`                          | `#1B5E3B`                 | 2px focus ring with a 2px offset (white `card` outline on the green)    |
| `overlay`                             | `rgb(28 25 23 / 0.5)`     | Dialog and drawer backdrop                                              |
| `elevation-card` / `elevation-raised` | warm shadows              | `shadow-card` (resting cards) and `shadow-raised` (hover, hero, panels) |

`index.css` also defines `bg-brand` (the green gradient), `bg-sidebar-brand` (the sidebar's
gradient) and `bg-dot-grid` (a faint decorative dot grid). `cn()` (`src/lib/utils.js`) knows
`shadow-card` and `shadow-raised` as shadow sizes, so a later shadow class replaces them.

### Adjusted tokens

Two starting values failed the contrast test on the earlier mint canvas (`#EAF5EC`) and were moved
to the nearest passing value:

| Token           | Start     | Ratio on canvas  | New       | Ratio on canvas |
| --------------- | --------- | ---------------- | --------- | --------------- |
| `positive`      | `#16A34A` | 2.95 (needs 3)   | `#16A149` | 3.01            |
| `positive-text` | `#15803D` | 4.48 (needs 4.5) | `#157F3D` | 4.54            |

## Usage rules

- **Never colour alone.** Every meaning has an icon or sign and a word: "+4.5% Increasing", "-2.0% Falling",
  status badges with an icon and a label (`DeltaTag`, `StatusBadge`). The forecast explanation steps
  use a triangle (▲ or ▼), a + or − sign and, for down steps, hatching instead of a word.
- **Chart bars** use the soft fill plus the strong outline (`positive-soft` with `positive`, `negative-soft` with `negative`);
  down steps of the explanation chart add `negative` hatching (`bar-hatch-down`).
- **Chart lines** use `chart-1` to `chart-4`, read in the chart through CSS variables (`var(--chart-1)`),
  never as hex values in a component. Series are also told apart by line style (solid, dashed, dotted,
  dash dot) and by a direct label at the end of each line, never by colour alone.
- **Dates on the farmer price and forecast screens** are never absolute: time is counted in months
  before the latest price ("3 months ago", "In 1 month"). See [forecast-display.md](forecast-display.md).
- **Sidebar and drawer** are deep green (`sidebar`, `bg-sidebar-brand`) with light text. On large
  screens the sidebar is fixed and full height with the logo at the top; the white header spans the
  content only. The active link is a white pill with green text; links on the green use a white
  focus outline.
- **Cards** are white, `rounded-2xl`, with a subtle border and `shadow-card`.
- **Green banners:** dashboards open with `DashboardHero`; Prices, Forecast, My listings and Orders
  with the compact `PageHero`; the forecast result is a green card. Text on them uses `on-primary`
  and `on-primary-muted`; buttons use `heroButton` or `heroOutlineButton`, and the change badge
  uses `DeltaTag tone="inverse"` (a frosted pill; the icon, sign and word carry the meaning).
- **Icon tiles:** section headings and figures pair an icon with a tinted tile (`primary-soft`,
  `accent-gold-soft` or `neutral-bg`, see `TILE_TONES` in `StatCard`). The tile colour is decoration;
  the label carries the meaning.
- **Gold** is an accent only: highlights such as "In 1 month", buyer counts, the next step card.
- **Touch targets** are at least 44 by 44 pixels (`min-h-11`, `size-11` on buttons, inputs, nav items).
- **Phone first.** Layouts start at 360px wide with no horizontal scroll; the sidebar appears at `lg`.
  Every role gets a hamburger menu on small screens that opens a drawer with the same items as the
  sidebar. The hamburger button repeats a navigation count (waiting orders, orders to review).
- **Text** is never below 16px in inputs (no mobile zoom on focus). System font stack, no web fonts.
  Page titles are `font-extrabold tracking-tight`; key figures are large and `tabular-nums`.
- **Focus** is always visible (2px `focus-ring` with an offset). `prefers-reduced-motion` disables animation.
- **Money and dates** go through `src/lib/format.js` (`formatKES`, `formatPct`, `formatMonth`,
  `formatDateTime` in Africa/Nairobi). The client never recomputes a charged amount.
- **English only**, with user facing strings kept in the component or in `src/api/errors.js` so they are easy to find.

## Measured contrast ratios

From `src/styles/tokens.test.js`, which reads `tokens.css` (print with
`npx vitest run src/styles --silent=false`).

| Foreground on background              | Ratio | Minimum |
| ------------------------------------- | ----- | ------- |
| text on card                          | 17.49 | 4.5     |
| text on canvas                        | 16.24 | 4.5     |
| text on neutral-bg                    | 15.22 | 4.5     |
| text on positive-soft                 | 12.46 | 4.5     |
| text on negative-soft                 | 9.21  | 4.5     |
| text-secondary on card                | 7.63  | 4.5     |
| text-secondary on canvas              | 7.09  | 4.5     |
| text-secondary on neutral-bg          | 6.64  | 4.5     |
| positive-text on card                 | 5.08  | 4.5     |
| positive-text on canvas               | 4.72  | 4.5     |
| negative-text on card                 | 6.47  | 4.5     |
| negative-text on canvas               | 6.01  | 4.5     |
| neutral-text on neutral-bg            | 8.94  | 4.5     |
| neutral-text on card                  | 10.27 | 4.5     |
| white (on-primary) on primary         | 7.75  | 4.5     |
| white (on-primary) on primary-hover   | 10.53 | 4.5     |
| white (on-primary) on negative-text   | 6.47  | 4.5     |
| primary on card                       | 7.75  | 4.5     |
| primary on canvas                     | 7.20  | 4.5     |
| positive on card                      | 3.37  | 3       |
| positive on canvas                    | 3.13  | 3       |
| negative on card                      | 4.83  | 3       |
| negative on canvas                    | 4.49  | 3       |
| focus-ring on card                    | 7.75  | 3       |
| focus-ring on canvas                  | 7.20  | 3       |
| chart-1 on card                       | 7.75  | 3       |
| chart-2 on card                       | 5.02  | 3       |
| chart-3 on card                       | 7.10  | 3       |
| chart-4 on card                       | 5.36  | 3       |
| primary on primary-soft               | 6.66  | 4.5     |
| text on primary-soft                  | 15.03 | 4.5     |
| text-secondary on primary-soft        | 6.56  | 4.5     |
| white (on-primary) on primary-deep    | 12.24 | 4.5     |
| on-primary-muted on primary           | 6.20  | 4.5     |
| on-primary-muted on primary-deep      | 9.80  | 4.5     |
| accent-gold on card                   | 4.92  | 3       |
| accent-gold-text on card              | 6.85  | 4.5     |
| accent-gold-text on accent-gold-soft  | 6.10  | 4.5     |
| white (on-primary) on sidebar         | 12.24 | 4.5     |
| on-primary-muted on sidebar           | 9.80  | 4.5     |
| card (white focus outline) on sidebar | 12.24 | 3       |

## Components

- `components/ui/`: shadcn/ui (button, input, label, card, badge, skeleton, alert, dialog, tabs, select,
  table, sonner toaster, separator, sheet, dropdown menu). Written by hand in JavaScript from the shadcn "new-york" sources,
  re-pointed at the tokens; `components.json` is configured for JavaScript (`tsx: false`).
- `components/layout/`: `AppShell`, `AccountMenu`, `navConfig`, `NavBadge` (the buyer's waiting
  orders and the administrator's "N orders need review"), `PublicLayout`, `BrandMark` (the logo:
  sprout tile and wordmark, `inverse` for the green).
- `components/auth/` (F1): `AuthLayout` (the form card; from `lg` a full height green brand panel
  beside it with the logo, a headline and three features; one screen tall, the form side scrolls
  if needed), `FormField`,
  `PasswordField` (show or hide toggle with `aria-pressed`), `CodeInput`, `FormErrorSummary`
  (`role="alert"`, links to fields), `CountdownButton` and `SubmitButton`, `PasswordRequirements`
  (icon plus "Done" or "Not yet"), `SignedInNotice`, `ResendCode`, `OfflineFormNotice`, `SuccessMessage`
  (icon plus a word, `positive-text`), `InfoMessage`. Field errors use `negative-text` with an icon.
- `components/feedback/`: `ErrorBoundary`, `ErrorState`, `EmptyState`, `LoadingState`, `OfflineBanner`,
  `ApiStatus`, `PwaUpdatePrompt`.
- `components/display/`: `PageHeader`, `DashboardHero` and `PageHero` (green banners, with
  `heroButton` and `heroOutlineButton`), `StatCard` (`tone`: primary, gold, neutral), `DeltaTag`
  (`tone="inverse"` on the green) (optionally with a `direction` from
  `directionOf` and a `suffix`), `StatusBadge`, `Money`, and for F2a: `PriceCard`
  (and `PriceChange`), `MarketChips` (toggle buttons, `aria-pressed`, one always selected), `Segmented`
  (native radio group, 44 px options), `CropChoice` (crop picture tiles on native radios, check
  mark and border for the choice; New listing and Forecast), `IconSelect` (native select with an
  icon and chevron, 48 px), `StepHeading` (numbered step heading), `ExplainabilityBars` (accessible list with `div` bars), `TrendChart` (wrapper with
  `role="img"` and a summary; lazily loads `TrendChartCanvas`, the only file that imports Recharts)
  and `DataTable` (caption, column and row headers). `StatusBadge` also takes `kind="listing"`
  (Active, Sold out, Removed) and shows the F2b order words ("Paid (test payment)", "Waiting for
  payment", "Not paid, expired", ...), with the existing positive, negative, neutral and outline
  variants (no new colours).
- `components/admin/` (F4): `ResponsiveTable` (a captioned table with row headers from 1280 px, the
  same rows as stacked cards below, two per row from 768 px, columns declared once, the same actions
  in both; only one layout is in the page; a table wider than its space shows the cards instead),
  `FilterBar` and `useFilterParams` (filters in the URL, validated, "Clear filters"),
  `SearchInput` (400 ms debounce, 2 to 50 characters), `ConfirmDialog` (consequences,
  optional required note with a counter, spinner, inline error, double submit guard, focus back to
  the trigger), `PayloadView` (text in a `pre`, 16 KB then "Show all", copy), `PaymentEventsDialog`,
  `RoleBadge` (Farmer, Buyer, Admin, "Main admin") and `ListParts` (Refresh, "Showing X of Y", Load
  more). `StatusBadge` gained `kind="adminOrder"` ("Needs review" in `negative` with a warning
  icon), `adminPayment`, `invite` (Pending, Used, Expired, Revoked, Locked) and `user` (Active,
  Disabled), all icon plus word with the existing variants (no new colours). Orders that need review
  are also marked with a `negative` left border, a warning icon and the words "Needs review".
- `components/listings/` (F2b): `ListingCard` (photo through `safeImageUrl` or a leaf placeholder),
  `ListingForm` (create and edit), `PhotoPicker` (two buttons, hidden file inputs, preview, live
  status), `PriceGuidance`, `ListingsSummary` (dashboard). `components/orders/`: `OrderCard`.
  `components/feedback/ConfirmDialog` (shadcn dialog; focus returns to the opener).
- `components/buyer/` (F3): `BuyerListingCard` (the whole card is one link), `ProducePhoto`,
  `QuantityStepper` (44 px minus and plus buttons), `CheckoutSummary`, `OrderSummaryCard`,
  `ExpiryCountdown` (announces only at 60 s, 30 s and the end), `PaymentStatusPanel` (an icon, a
  headline and words for each state; the border tone is extra, never the only signal) and
  `SandboxNote`. `StatusBadge kind="payment"` shows "Sending request", "Waiting for your phone",
  "Payment received", "Payment failed", "Payment cancelled" and "Timed out" with the existing
  variants. The navigation count badge (`components/layout/NavBadge.jsx`) is white
  (`on-primary`) on `negative-text` (6.47:1), with its number hidden from screen readers and a
  spoken label ("2 orders waiting for payment") instead. No new colour tokens.

The PWA icon (`public/favicon.svg`, a leaf on the primary green) is a **placeholder**. Its fill must match
the `primary` token (a test checks this). Regenerate the PNG icons with `npm run gen:icons`.
