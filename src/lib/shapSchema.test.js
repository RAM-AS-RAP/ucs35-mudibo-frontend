import { describe, expect, it } from 'vitest';
import { fixtures } from '@/test/fixtures';
import { isForecastUsable, parseShap, shapSchema } from './shapSchema';

const sample = () => structuredClone(fixtures.forecastOneMonth);

describe('shap_values schema', () => {
  it.each([
    ['forecastOneMonth', fixtures.forecastOneMonth],
    ['forecastTwoMonth', fixtures.forecastTwoMonth],
  ])('the %s fixture explanation matches the schema', (_name, forecast) => {
    const result = shapSchema.safeParse(forecast.shap_values);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('needs at least one group', () => {
    const forecast = sample();
    forecast.shap_values.groups = [];
    expect(parseShap(forecast.shap_values)).toBeNull();
  });
});

describe('parseShap', () => {
  it('accepts both fixture explanations', () => {
    expect(parseShap(fixtures.forecastOneMonth.shap_values)).not.toBeNull();
    expect(parseShap(fixtures.forecastTwoMonth.shap_values)).not.toBeNull();
  });

  it('does not reconcile against the headline (the backend rounds it to 2 decimals)', () => {
    const forecast = sample();
    forecast.predicted_log_change = Number(forecast.predicted_log_change.toFixed(2));
    forecast.shap_values.groups[0].log_contribution += 0.01;
    forecast.shap_values.predicted_price += 0.05;
    expect(parseShap(forecast.shap_values)).not.toBeNull();
  });

  it.each([
    ['shap_values', (f) => delete f.shap_values],
    ['typical_change', (f) => delete f.shap_values.typical_change],
    ['groups', (f) => delete f.shap_values.groups],
    ['a group label', (f) => delete f.shap_values.groups[1].label],
  ])('is null when %s is missing', (_name, mutate) => {
    const forecast = sample();
    mutate(forecast);
    expect(parseShap(forecast.shap_values)).toBeNull();
  });

  it.each([
    ['a string contribution', (f) => (f.shap_values.groups[0].pct_contribution = '3.05')],
    ['a NaN log value', (f) => (f.shap_values.typical_change.log_value = Number.NaN)],
    ['an infinite price', (f) => (f.shap_values.predicted_price = Number.POSITIVE_INFINITY)],
    ['a null base value', (f) => (f.shap_values.base_value = null)],
    ['a bad direction', (f) => (f.shap_values.groups[0].direction = 'up')],
  ])('is null for %s', (_name, mutate) => {
    const forecast = sample();
    mutate(forecast);
    expect(parseShap(forecast.shap_values)).toBeNull();
  });

  it('is null for nothing at all', () => {
    expect(parseShap(null)).toBeNull();
    expect(parseShap({})).toBeNull();
  });
});

describe('isForecastUsable', () => {
  it('accepts the fixtures and rejects missing or broken headline numbers', () => {
    expect(isForecastUsable(fixtures.forecastOneMonth)).toBe(true);
    expect(isForecastUsable({ ...sample(), predicted_price: null })).toBe(false);
    expect(isForecastUsable({ ...sample(), origin_price: 0 })).toBe(false);
    expect(isForecastUsable({ ...sample(), horizon: 'three_month' })).toBe(false);
  });
});
