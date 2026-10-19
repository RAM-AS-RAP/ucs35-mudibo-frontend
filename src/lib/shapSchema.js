/**
 * Runtime validation of a forecast's explanation (`shap_values`).
 *
 * `shap_values` is a free form JSON object in openapi.json, so no types are generated for it.
 * The screen draws the explanation bars from the backend's numbers whenever parseShap() accepts
 * the shape; no reconciliation against the headline is done. See docs/forecast-display.md.
 */
import { z } from 'zod';

const finite = z.number().finite();

export const directionSchema = z.enum(['increases', 'decreases', 'neutral']);

export const groupSchema = z.object({
  label: z.string().min(1),
  log_contribution: finite,
  pct_contribution: finite,
  direction: directionSchema,
});

export const shapSchema = z.object({
  origin_price: finite,
  predicted_price: finite,
  predicted_log_change: finite,
  expected_change_pct: finite,
  base_value: finite,
  typical_change: z.object({
    label: z.string().min(1),
    log_value: finite,
    pct_value: finite,
  }),
  groups: z.array(groupSchema).min(1),
});

/**
 * The headline fields of a forecast that the screen needs. The 200 response of GET /forecasts
 * has no schema in openapi.json, so they are checked here before anything is shown.
 */
export const forecastHeadlineSchema = z.object({
  market: z.string().min(1),
  crop: z.string().min(1),
  horizon: z.enum(['one_month', 'two_month']),
  origin_price: finite.positive(),
  predicted_price: finite,
  expected_change_pct: finite,
});

/** @typedef {z.infer<typeof shapSchema>} ShapValues */
/** @typedef {z.infer<typeof groupSchema>} ShapGroup */

/**
 * The parsed explanation, or null when it does not match the expected shape.
 * @param {unknown} value
 * @returns {ShapValues | null}
 */
export function parseShap(value) {
  const result = shapSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * True when the forecast's headline fields are usable numbers.
 * @param {unknown} forecast
 */
export function isForecastUsable(forecast) {
  return forecastHeadlineSchema.safeParse(forecast).success;
}
