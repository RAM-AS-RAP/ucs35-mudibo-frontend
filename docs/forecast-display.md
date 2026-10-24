# Prices, trends and the explainable forecast (module F2a)

How the farmer's decision support screens show prices, trends and forecasts, and why they show
them this way. This document is also source material for the project report.

The backend is the authority for every number. The frontend formats what it receives and derives
only three display values: the price of a 90 kg bag, the approximate KES per kg of each
explanation group, and the summary sentence. It never recomputes a price, a change or a
contribution.

## Screens and endpoints

| Screen    | Path               | What it shows                                                                                                                                                                                                                                                 | Endpoints                                                                                                                                                                                                                                                                                               |
| --------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard | `/farmer`          | Greeting; latest maize and beans prices per market with the change against the month before; the one month forecast for maize and beans in the first market; a summary of active listings and paid orders (F2b, see [listings-orders.md](listings-orders.md)) | `GET /markets`, `GET /prices/current?crop=maize`, `GET /prices/current?crop=beans` and the two counts `GET /listings/mine?status=active&limit=1`, `GET /listings/mine/orders?status=paid&limit=1` (in parallel), then `GET /forecasts?market=<first>&crop=maize\|beans&horizon=one_month` (in parallel) |
| Prices    | `/farmer/prices`   | Crop control; a price card per market; the price trend for the selected markets and range, with a data table                                                                                                                                                  | `GET /prices/current?crop=`, `GET /markets`, `GET /prices/trends?market=&crop=&months=` (one per selected market, in parallel)                                                                                                                                                                          |
| Forecast  | `/farmer/forecast` | Market and crop controls with the "Request 1 month forecast" button; after the click, the 1 month ahead headline and the "Why the model expects this" button; unavailable state; "Plan a listing"                                                             | `GET /markets` on load; only after the click `GET /forecasts?market=&crop=&horizon=one_month`, and `GET /prices/current?crop=` when that forecast is unavailable                                                                                                                                        |

Selections live in the URL query string (`crop`, `markets`, `range`, `market`, `horizon`), so a
screen can be bookmarked or shared. Only these non sensitive values are stored. Each is checked
against its allowed values (crops, the `one_month` horizon, ranges 12, 24 and 60) or against the markets from
`GET /markets`. An invalid value is removed from the URL and the default applies (maize, all
markets, 24 months, the first market, one month). Changing a selection does not move keyboard
focus; navigating to another screen moves focus to its heading.

`GET /prices/current` returns `{ items: CurrentPriceItem[], as_of_note }`. Each item has `market`,
`crop`, `month`, `avg_price_per_kg`, `source`, `fetched_at`, `previous_month`, `previous_price` and
`change_pct`; the last three are null when the month before has no price.

## Relative time only

The farmer price, trend and forecast screens never show a calendar month, a year, a month number, a
date or an "updated" time: not in text, tooltips, chart axes, table cells, `aria-label`,
`aria-description`, `title`, `alt` or `placeholder` attributes, the document title, toasts or the
URL. Time is counted in whole months back from the latest published price, which the farmer sees as
"now".

- **Anchor for one series:** its latest published month is "Latest" (on a chart axis, "Now"). The
  month before is "1 month ago", and so on.
- **Anchor for several markets:** the newest latest month among the markets shown. A market whose
  latest month is older gets a neutral tag "1 month older" ("N months older") and its points sit
  that many months back on the shared axis.
- **Forecasts:** farmers see only the `one_month` horizon, "In 1 month", counted from the latest
  published price. The 2 month forecast is not offered: the screen never requests `two_month`, and
  `?horizon=two_month` (an old link) is removed from the URL. The label comes from the `horizon` value.
- The backend's date fields (`month`, `previous_month`, `origin_month`, `target_month`, `based_on`,
  `for_month`, `generated_at`, `fetched_at`, `first_month`, `last_month`, and each trend point's
  `month`) are used only to compute differences in whole months. The backend's `as_of_note` is not
  shown. "Current price" in the report means the latest published monthly price.
- `src/lib/relativeTime.js` parses `YYYY-MM-DD` by splitting it into integers and never uses `Date`,
  `Intl` or the device clock. A source check enforces this for an explicit list of files (`RELATIVE_ONLY` in
  `src/test/source.test.js`: the price, trend, forecast and dashboard price files, the display
  components of these screens, the forecast logic and the listing form's `PriceGuidance`), and a test runs the functions under two time zones.

**Why:** a month count is simpler for farmers to read than a date, and it removes the risk of a wrong
label from a phone with a wrong clock or time zone. The prices are monthly figures, so "how many
months old" is the information that matters.

## Prices and trends

- **Price card:** market name, "Latest price", "KES 82.00 per kg", "About KES 7,380 per 90 kg bag"
  (price times 90, rounded to the nearest 10 KES), and the change against the month before as
  "+4.5% vs 1 month ago" with the direction word. A null `change_pct` shows "No change data".
- **Direction words:** a change of at least +1% is "Increasing" (arrow up), at most -1% is "Falling"
  (arrow down), anything in between is "Little change" (a minus sign). The threshold is
  `NEUTRAL_THRESHOLD_PCT` in `src/lib/forecast.js`.
- **Trend chart:** one line per selected market with markers; the x axis runs from the oldest month
  on the left to "Now" on the right, labelled on every third month ("3 mo ago"), with the title
  "Months before the latest price"; the y axis is in KES. Months without a price are gaps: they are
  never filled or interpolated (`connectNulls` is off). The tooltip says "3 months ago: KES 82.00"
  with the market name. Series differ by colour, by line style (solid, dashed, dotted, dash dot) and
  by a direct label at the end of each line.
- **Text alternative:** the chart wrapper has `role="img"` and a generated summary, for example
  "Maize in Nairobi, 14 months of prices. Latest KES 82.00. Lowest KES 74.00, 6 months ago. Highest
  KES 90.00, 2 months ago." The "See the numbers" element holds a data table with a "Period" column
  (newest row last) and one column per market; a missing month says "No price".
- With fewer than 3 plotted months the screen shows the table and a note instead of a chart.

## The forecast

### Headline

The predicted price (`predicted_price`) in large text with "per kg", the bag line, the expected
change (`expected_change_pct`) with its direction word and icon, and the caption
"Expected in 1 month, starting from the latest price of KES 40.00 per kg." (`origin_price`).

There is no horizon choice: only the 1 month ahead forecast is requested and shown.

### Request flow (decision support)

The screen fetches nothing about the forecast until the farmer asks for it:

1. On load it shows only the Market and Crop controls, the **Request 1 month forecast**
   button. Only `GET /markets` is sent.
2. The click enables the forecast query (`useForecast({ ..., enabled })`) for that market and crop.
   The card shows the loading, error, unavailable or headline state. A forecast already cached by
   the dashboard or the listing form appears at once, but never before the click.
3. Under the headline, **Why the model expects this** (`aria-expanded`) opens and closes the
   explanation below; it starts closed. "Plan a listing" appears once a forecast is shown.
4. Changing the market or crop clears the request and closes the explanation, so a shown forecast
   always matches the selection.
5. The request (market, crop and whether the explanation is open) is kept in memory by
   `src/screens/farmer/forecastRequest.js`, not in the URL or storage. After a visit to another
   tab, the sidebar link (which carries no selection) brings back that market and crop, writes
   them into the URL and shows the forecast and explanation again, from the cache while it is
   fresh. A link with a selection of its own (from the dashboard or the listing form) shows the
   request button instead, unless it names the requested market and crop. Signing out or
   reloading forgets the request.

There is no recommendation box, no uncertainty box, no hint text and no limitations line: the
headline's direction word and icon say which way the model expects the price to move.

### Why the model expects this

`shap_values` comes from the ML pipeline unchanged:

```
typical_change: { label, log_value, pct_value }
groups: [{ label, log_contribution, pct_contribution, direction }]   direction: increases | decreases | neutral
```

The model predicts the log change of the price. In log space the explanation is exact:
`typical_change.log_value + sum(groups[].log_contribution) = predicted_log_change`.

The screen shows a **price staircase** (`explainabilityChart()` in `src/lib/forecast.js`, drawn by
`ExplainabilityBars`):

1. **Latest price** (`origin_price`): a dot on the scale.
2. **One step for the typical change**, then **one step per driver group**, largest absolute log
   contribution first. Each step starts where the one before ended. A step that pushed the forecast
   up is solid green (`positive-soft` fill, `positive` outline) with ▲ and a + sign; a step that
   pulled it down is hatched red (`bar-hatch-down` in `index.css`: `negative` stripes on
   `negative-soft`, `negative` outline) with ▼ and a − sign. There is no neutral step and no
   Boost, Drag or "No effect" word: the direction comes from the sign of the log contribution (then
   of the percentage, then the backend's `direction`), so even a part that rounds to KES 0.00 is
   shown as "+KES 0.00" or "-KES 0.00".
3. **Forecast** ("Forecast in 1 month", `predicted_price`): a thin dark line from the latest price
   to a dot at the forecast price.

Then "How to read this" (three sentences and "What each part means" with each part's description)
and "See the numbers" (a table: part of the forecast, effect in percentage points, KES per kg and the
price after that part).

**KES per step (display only).** The parts add up in log terms, not in KES, so the KES change
(`predicted_price - origin_price`, both from the server) is shared out between the parts in
proportion to their log contributions, in whole cents with the largest remainder method. The steps
therefore land exactly on the forecast price and no "do not add up" note is needed. For the sample
(KES 40.00 to KES 42.49) the steps are +0.29, +1.45, +1.25 and −0.50. This is used only when the
explanation agrees with the headline (the ratio of `ln(predicted / origin)` to the sum of the log
contributions is between 0.8 and 1.25); otherwise each part keeps its own approximate amount
(`origin_price * pct / 100`) and the last step may stop a little short of the forecast dot.

**Scale.** One scale in KES per kg for every row, zoomed to the prices the steps pass through, with
6% room on each side and tick marks at 1, 2, 2.5 or 5 times a power of ten. The scale is always at
least 5% of the latest price wide (`MIN_AXIS_SHARE`), so a tiny forecast change does not fill the
chart and look dramatic. Every step bar is at least 0.5 rem wide, so a one cent step is still
visible. Dotted connectors join the end of each step to the start of the next.

**Layout.** From `sm` each row is name, track and amount side by side, with fixed column widths so
the tracks line up. On phones the name and amount share a line and the track sits underneath at full
width.

The explanation container is a `figure` whose accessible name is the summary sentence, for example:
"Forecast for 1 month ahead: KES 42.49 per kg, up 6.2% from the latest price of KES 40.00. Time of
year adds about KES 1.45, recent price momentum adds about KES 1.25, and price compared with its
recent average takes away about KES 0.50." The rows are a list whose names and amounts are text;
the tracks are `aria-hidden`.

### Shape check

The staircase is drawn from the backend's `shap_values` whenever `parseShap(forecast.shap_values)`
(`src/lib/shapSchema.js`) accepts it: every number finite, `direction` one of the three values, at
least one group, every documented key present.

The frontend does not reconcile the explanation against the headline. An earlier version checked
that the log contributions added up to the top level `predicted_log_change` within 0.002, but the
backend serialises that field rounded to 2 decimals (up to 0.005 off), so most real forecasts failed
and the chart never appeared. The ML pipeline already asserts the sum to within 1e-6 before it stores
a forecast, so the frontend trusts the backend's numbers as given.

When the shape check fails, the screen keeps the headline,
hides the chart, and says "The explanation for this forecast is not available right now." The headline itself needs finite
`origin_price` (above zero), `predicted_price` and `expected_change_pct`; otherwise the screen says
"This forecast cannot be shown right now. Please check again soon."

### Unavailable forecasts

`getForecast()` turns only a 404 `forecast_unavailable` into a normal result
`{ status: "unavailable", reason }`; every other error (including 404 `market_not_available`) is an
`ApiError` and shows the error state with "Try again" and the reference.

- `no_forecast`: "A forecast is not available yet for Nairobi maize. We forecast only from the latest
  published prices. Please check again soon."
- `stale`: "The latest forecast for Nairobi maize is out of date because new prices have not been
  published yet. Please check again soon."

Under the message the screen shows the latest price for that market and crop, if there is one, and
a link to the Prices screen. An older forecast is never
shown.

### Next step

"Plan a listing" links to `/farmer/listings/new?crop=<crop>&market=<market>` with "You choose the
price you ask for." The listing form preselects that crop and market and shows the same guidance (`PriceGuidance`, also relative time only).

## Wording rules

- Describe how the model reached the forecast. Never claim a cause for real price movements
  ("Time of year adds about KES 1.45" describes the model, not the market).
- Never "will": write "the model expects".
- No financial guarantees and no instructions: the decision is the farmer's.
- Plain English, short sentences.
- Explanation steps: the triangle (▲ or ▼) and the sign always appear next to the colour, and
  down steps are hatched. No Boost, Drag or "No effect" words.
- No absolute dates (see "Relative time only").

The texts live in `src/lib/messages.js` (`FORECAST_TEXT`, `PRICE_TEXT` and
the group descriptions) and `src/lib/forecast.js` (the summary sentence).

## Explanation chart without Recharts (deviation from the project report)

The project report lists Recharts for all charts. The explanation staircase is instead an accessible
list (`ExplainabilityBars`: a `ul` of rows, bars are `div`s with `aria-hidden`, placed on the shared
scale with `axisPercent`). Reasons: each row carries a label, a sign and a KES amount
that must stay readable and wrap at 360 px, which an SVG chart cannot do well; a list is read by
screen readers row by row without extra work; and the screen needs no chart library for its most
important part. Recharts is used for the price trend only, and it is loaded lazily inside the trend
chart component so it is not part of the initial JavaScript.

## Accessibility

- Every screen has an axe test in the success, loading, empty, error and unavailable states (and the
  inconsistent explanation state for the forecast).
- Never colour alone: direction words and icons, explanation triangles, signs and hatching, line styles and end
  labels, a check mark on a selected market chip.
- Chart tokens `chart-1` to `chart-4` have at least 3:1 contrast against the card (see
  `docs/design-system.md`).
- Controls: crop and range are native radio groups (`fieldset` and `legend`, arrow keys);
  market chips are toggle buttons with `aria-pressed`; every target is at least 44 by 44 px.
- The trend chart has `role="img"` with a summary and a data table alternative; the explanation is a
  `figure` named by its summary sentence; `details` elements hold the tables.
- Focus moves to the screen heading on a route change only, not when a selection changes the URL.
- `prefers-reduced-motion` turns the chart animation off.

## Limitations

- The data are monthly averages from FEWS NET, so the latest price can be a few weeks old and a
  market can lag another by a month or more.
- Forecasts are estimates, not guarantees, and can be wrong, especially after sudden events.
- The explanation bars are approximate shares of the model's estimate in percentage terms; they do
  not add up exactly and they do not explain why real prices move.
- Prices per 90 kg bag are rounded to the nearest 10 KES.
- Relative labels count whole months; they do not say how many days old a price is.
