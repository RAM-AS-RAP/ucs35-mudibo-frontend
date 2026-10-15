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

| Token                         | Value                     | Use                                                               |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------- |
| `primary`                     | `#1B5E3B`                 | Brand and main actions, active navigation item (white text on it) |
| `primary-hover`               | `#14482D`                 | Hover and pressed                                                 |
| `on-primary`                  | `#FFFFFF`                 | Text and icons on `primary`                                       |
| `canvas`, `sidebar`           | `#EAF5EC`                 | Page background and navigation background (pale mint)             |
| `card`                        | `#FFFFFF`                 | Cards and panels                                                  |
| `text`                        | `#111827`                 | Headings, body, large numbers                                     |
| `text-secondary`              | `#4B5563`                 | Labels and secondary text                                         |
| `border`                      | `#D1D5DB`                 | Subtle borders                                                    |
| `neutral-bg` / `neutral-text` | `#F3F4F6` / `#374151`     | Neutral tags (for example a 0.0% delta)                           |
| `positive`                    | `#16A149` (was `#16A34A`) | Positive icons and chart outlines                                 |
| `positive-soft`               | `#86EFAC`                 | Positive chart bar fill, recommendation box tint                  |
| `positive-text`               | `#157F3D` (was `#15803D`) | Positive text such as "+4.5%"                                     |
| `negative`                    | `#DC2626`                 | Negative icons and chart outlines                                 |
| `negative-soft`               | `#FCA5A5`                 | Negative chart bar fill                                           |
| `negative-text`               | `#B91C1C`                 | Negative text                                                     |
| `focus-ring`                  | `#1B5E3B`                 | 2px focus ring with a 2px offset                                  |
| `overlay`                     | `rgb(17 24 39 / 0.5)`     | Dialog and drawer backdrop                                        |

### Adjusted tokens

Two starting values failed the contrast test on the mint canvas and were moved to the nearest passing value:

| Token           | Start     | Ratio on canvas  | New       | Ratio on canvas |
| --------------- | --------- | ---------------- | --------- | --------------- |
| `positive`      | `#16A34A` | 2.95 (needs 3)   | `#16A149` | 3.01            |
| `positive-text` | `#15803D` | 4.48 (needs 4.5) | `#157F3D` | 4.54            |

## Usage rules

- **Never colour alone.** Every meaning has an icon or sign and a word: "+4.5% Increasing", "-2.0% Falling",
  "Boost" or "Drag" on explanation bars, status badges with an icon and a label (`DeltaTag`, `StatusBadge`).
- **Chart bars** use the soft fill plus the strong outline (`positive-soft` with `positive`, `negative-soft` with `negative`).
- **Sidebar and canvas** share the mint, separated by a visible `border` line.
- **Cards** are white with a subtle border or shadow.
- **Touch targets** are at least 44 by 44 pixels (`min-h-11`, `size-11` on buttons, inputs, nav items).
- **Phone first.** Layouts start at 360px wide with no horizontal scroll; the sidebar appears at `lg`.
  Farmer and buyer get a bottom navigation bar on small screens, admin gets a drawer.
- **Text** is never below 16px in inputs (no mobile zoom on focus). System font stack, no web fonts.
- **Focus** is always visible (2px `focus-ring` with an offset). `prefers-reduced-motion` disables animation.
- **Money and dates** go through `src/lib/format.js` (`formatKES`, `formatPct`, `formatMonth`,
  `formatDateTime` in Africa/Nairobi, `maskedPhone`). The client never recomputes a charged amount.
- **English only**, with user facing strings kept in the component or in `src/api/errors.js` so they are easy to find.

## Measured contrast ratios

From `src/styles/tokens.test.js`, which reads `tokens.css` (print with
`npx vitest run src/styles --silent=false`).

| Foreground on background            | Ratio | Minimum |
| ----------------------------------- | ----- | ------- |
| text on card                        | 17.74 | 4.5     |
| text on canvas                      | 15.86 | 4.5     |
| text on neutral-bg                  | 16.12 | 4.5     |
| text on positive-soft               | 12.63 | 4.5     |
| text-secondary on card              | 7.56  | 4.5     |
| text-secondary on canvas            | 6.76  | 4.5     |
| text-secondary on neutral-bg        | 6.87  | 4.5     |
| positive-text on card               | 5.08  | 4.5     |
| positive-text on canvas             | 4.54  | 4.5     |
| negative-text on card               | 6.47  | 4.5     |
| negative-text on canvas             | 5.78  | 4.5     |
| neutral-text on neutral-bg          | 9.37  | 4.5     |
| neutral-text on card                | 10.31 | 4.5     |
| white (on-primary) on primary       | 7.75  | 4.5     |
| white (on-primary) on primary-hover | 10.53 | 4.5     |
| primary on card                     | 7.75  | 4.5     |
| primary on canvas                   | 6.92  | 4.5     |
| positive on card                    | 3.37  | 3       |
| positive on canvas                  | 3.01  | 3       |
| negative on card                    | 4.83  | 3       |
| negative on canvas                  | 4.32  | 3       |
| focus-ring on card                  | 7.75  | 3       |
| focus-ring on canvas                | 6.92  | 3       |

## Components

- `components/ui/`: shadcn/ui (button, input, label, card, badge, skeleton, alert, dialog, tabs, select,
  table, sonner toaster, separator, sheet). Written by hand in JavaScript from the shadcn "new-york" sources,
  re-pointed at the tokens; `components.json` is configured for JavaScript (`tsx: false`).
- `components/layout/`: `AppShell`, `navConfig`, `PublicLayout`, `AuthPlaceholder`, `RoleSection`.
- `components/feedback/`: `ErrorBoundary`, `ErrorState`, `EmptyState`, `LoadingState`, `OfflineBanner`,
  `ApiStatus`, `PwaUpdatePrompt`.
- `components/display/`: `PageHeader`, `StatCard`, `DeltaTag`, `StatusBadge`, `Money`, `ComingSoon`.

The PWA icon (`public/favicon.svg`, a leaf on the primary green) is a **placeholder**. Its fill must match
the `primary` token (a test checks this). Regenerate the PNG icons with `npm run gen:icons`.
