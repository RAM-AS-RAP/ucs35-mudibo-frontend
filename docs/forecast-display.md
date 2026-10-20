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
| Forecast  | `/farmer/forecast` | Market, crop and horizon controls; headline; horizon strip; recommendation; "Why the model expects this"; unavailable state; "Plan a listing"; limitations                                                                                                    | `GET /markets`, `GET /forecasts?market=&crop=&horizon=one_month` and `two_month` (in parallel), `GET /prices/current?crop=` (only when a forecast is unavailable)                                                                                                                                       |

Selections live in the URL query string (`crop`, `markets`, `range`, `market`, `horizon`), so a
screen can be bookmarked or shared. Only these non sensitive values are stored. Each is checked
against its allowed values (crops, horizons, ranges 12, 24 and 60) or against the markets from
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
- **Forecasts:** horizon `one_month` is "In 1 month", `two_month` is "In 2 months", counted from the
  latest published price. The label comes from the `horizon` value.
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

The horizon strip shows both horizons side by side ("In 1 month", "In 2 months") with their predicted
price and change; the selected card has an outline and `aria-current`. Both horizons are fetched in
parallel, so switching does not refetch.

### Recommendation

`recommendationFor(expectedChangePct, horizon)`:

| Direction | Title                               | Body                                                                                                                                                                                                 |
| --------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rise      | The model expects the price to rise | The forecast is for the price to rise by about X% in 1 month. Waiting may give a better price, but only if you can keep your produce safely and do not need the money sooner. The decision is yours. |
| fall      | The model expects the price to fall | The forecast is for the price to fall by about X% in 1 month. Selling sooner may protect your income, if you have a buyer. The decision is yours.                                                    |
| flat      | The model expects little change     | Choose when to sell based on your own needs and the offers you receive.                                                                                                                              |

It is always followed by: "Forecasts are estimates and can be wrong. Weather, supply, policy and
local conditions can change prices in ways the model cannot see." and the note "Forecasts look ahead
from the latest published prices."

### Why the model expects this

`shap_values` comes from the ML pipeline unchanged:

```
typical_change: { label, log_value, pct_value }
groups: [{ label, log_contribution, pct_contribution, direction }]   direction: increases | decreases | neutral
```

The model predicts the log change of the price. In log space the explanation is exact:
`typical_change.log_value + sum(groups[].log_contribution) = predicted_log_change`. The screen shows:

1. **Typical change** for this market and crop (for example +0.7%): where the model starts before it
   looks at the recent prices. Neutral tag and a neutral bar.
2. **One row per driver group**, largest absolute log contribution first: the label, a plain
   description, the word **Boost** (the group pushed the model's forecast up) or **Drag** (it pulled
   the forecast down) or "No effect", the sign and the percentage points (`pct_contribution`), and
   the approximate effect in KES per kg ("about +KES 1.42 per kg" = `origin_price * pct / 100`,
   rounded to 2 decimals, display only).
3. **Total row** with the exact expected change and the predicted price from the server.
4. The note: "The bars show how the model reached this forecast. They are approximate shares and do
   not add up exactly. They do not prove why prices move." Then "How to read this" (three sentences)
   and "See the numbers" (a table: part of the forecast, effect in percentage points, about KES per kg).

Bar length is `barFraction`: the absolute percentage divided by the largest absolute percentage among
the groups and the typical change (between 0 and 1). Drag bars grow left from a centre line, Boost bars
right. Boost bars use the `positive-soft` fill with a `positive` outline, Drag bars `negative-soft`
with `negative`, and "No effect" and the typical change use `neutral-bg`. The word and the sign are
always printed next to the bar, so colour is never the only signal. The percentage contributions are
first order approximations: they do not add up to the expected change, which is why the note says so.

The explanation container is a `figure` whose accessible name is the summary sentence, for example:
"Forecast for 1 month ahead: KES 42.49 per kg, up 6.2% from the latest price of KES 40.00. Time of
year adds about KES 1.42, recent price momentum adds about KES 1.22, and price compared with its
recent average takes away about KES 0.48."

### Shape check

The bars are drawn from the backend's `shap_values` whenever `parseShap(forecast.shap_values)`
(`src/lib/shapSchema.js`) accepts it: every number finite, `direction` one of the three values, at
least one group, every documented key present.

The frontend does not reconcile the explanation against the headline. An earlier version checked
that the log contributions added up to the top level `predicted_log_change` within 0.002, but the
backend serialises that field rounded to 2 decimals (up to 0.005 off), so most real forecasts failed
and the bars never appeared. The ML pipeline already asserts the sum to within 1e-6 before it stores
a forecast, so the frontend trusts the backend's numbers as given.

When the shape check fails, the screen keeps the headline, the horizon strip and the recommendation,
hides the bars, and says "The explanation for this forecast is not available right now." The headline itself needs finite
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
a link to the Prices screen. The other horizon is shown independently. An older forecast is never
shown.

### Next step and limitations

"Plan a listing" links to `/farmer/listings/new?crop=<crop>&market=<market>` with "You choose the
price you ask for." The listing form preselects that crop and market and shows the same guidance (`PriceGuidance`, also relative time only). At the bottom: "These forecasts use monthly
prices published by FEWS NET. A model trained on past prices can be wrong, especially after sudden
events."

## Wording rules

- Describe how the model reached the forecast. Never claim a cause for real price movements
  ("Time of year adds about KES 1.42" describes the model, not the market).
- Never "will": write "the model expects".
- No financial guarantees and no instructions: the decision is the farmer's.
- Plain English, short sentences.
- The words Boost and Drag always appear next to the colour.
- No absolute dates (see "Relative time only").

The texts live in `src/lib/messages.js` (`FORECAST_TEXT`, `PRICE_TEXT`, the freshness constants and
the group descriptions) and `src/lib/forecast.js` (the recommendation and summary sentences).

## Explanation bars without Recharts (deviation from the project report)

The project report lists Recharts for all charts. The explanation bars are instead an accessible list
(`ExplainabilityBars`: a `ul` of rows, bars are `div`s with `aria-hidden` and a width from
`barFraction`). Reasons: each row carries a label, a description, a word, a sign and a KES amount
that must stay readable and wrap at 360 px, which an SVG chart cannot do well; a list is read by
screen readers row by row without extra work; and the screen needs no chart library for its most
important part. Recharts is used for the price trend only, and it is loaded lazily inside the trend
chart component so it is not part of the initial JavaScript.

## Accessibility

- Every screen has an axe test in the success, loading, empty, error and unavailable states (and the
  inconsistent explanation state for the forecast).
- Never colour alone: direction words and icons, Boost and Drag words, signs, line styles and end
  labels, a check mark on a selected market chip.
- Chart tokens `chart-1` to `chart-4` have at least 3:1 contrast against the card (see
  `docs/design-system.md`).
- Controls: crop, horizon and range are native radio groups (`fieldset` and `legend`, arrow keys);
  market chips are toggle buttons with `aria-pressed`; the horizon cards are buttons with
  `aria-current` on the selected one; every target is at least 44 by 44 px.
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
