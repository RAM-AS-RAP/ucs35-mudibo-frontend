import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readTokens } from '../../scripts/tokens.mjs';
import { contrastRatio } from '@/test/contrast';

// Reads src/styles/tokens.css, the same file the app uses.
const tokens = readTokens();

/** [foreground, background, minimum ratio] */
const PAIRS = [
  ['text', 'card', 4.5],
  ['text', 'canvas', 4.5],
  ['text', 'neutral-bg', 4.5],
  ['text', 'positive-soft', 4.5],
  // The "fall" recommendation box.
  ['text', 'negative-soft', 4.5],
  ['text-secondary', 'card', 4.5],
  ['text-secondary', 'canvas', 4.5],
  ['text-secondary', 'neutral-bg', 4.5],
  ['positive-text', 'card', 4.5],
  ['positive-text', 'canvas', 4.5],
  ['negative-text', 'card', 4.5],
  ['negative-text', 'canvas', 4.5],
  ['neutral-text', 'neutral-bg', 4.5],
  ['neutral-text', 'card', 4.5],
  ['on-primary', 'primary', 4.5],
  ['on-primary', 'primary-hover', 4.5],
  // The navigation count badge (F3): white text on the negative text colour.
  ['on-primary', 'negative-text', 4.5],
  ['primary', 'card', 4.5],
  ['primary', 'canvas', 4.5],
  ['positive', 'card', 3],
  ['positive', 'canvas', 3],
  ['negative', 'card', 3],
  ['negative', 'canvas', 3],
  ['focus-ring', 'card', 3],
  ['focus-ring', 'canvas', 3],
  // Chart lines and their end labels on the white chart card.
  ['chart-1', 'card', 3],
  ['chart-2', 'card', 3],
  ['chart-3', 'card', 3],
  ['chart-4', 'card', 3],
];

describe('design token contrast (WCAG)', () => {
  it('defines every palette token as a hex value', () => {
    for (const name of [
      'primary',
      'primary-hover',
      'on-primary',
      'canvas',
      'sidebar',
      'card',
      'text',
      'text-secondary',
      'border',
      'neutral-bg',
      'neutral-text',
      'positive',
      'positive-soft',
      'positive-text',
      'negative',
      'negative-soft',
      'negative-text',
      'focus-ring',
      'chart-1',
      'chart-2',
      'chart-3',
      'chart-4',
    ]) {
      expect(tokens[name], name).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(tokens.sidebar).toBe(tokens.canvas);
    expect(tokens['chart-1']).toBe('#1B5E3B');
    expect(tokens['chart-2']).toBe('#B45309');
  });

  it('meets the minimum contrast ratios', () => {
    const rows = PAIRS.map(([fg, bg, min]) => ({
      pair: `${fg} on ${bg}`,
      ratio: Number(contrastRatio(tokens[fg], tokens[bg]).toFixed(2)),
      min,
    }));
    console.table(rows);
    const failing = rows.filter((row) => row.ratio < row.min);
    expect(failing).toEqual([]);
  });

  it('keeps the placeholder icon on the primary token colour', () => {
    const svg = readFileSync('public/favicon.svg', 'utf8');
    expect(svg).toContain(`fill="${tokens.primary}"`);
  });
});
