import { expect } from 'vitest';

/** Attributes whose values people read or hear. */
const USER_FACING_ATTRIBUTES = ['aria-label', 'aria-description', 'title', 'alt', 'placeholder'];

/**
 * Every string a person can see or hear in a rendered tree: the text content (including screen
 * reader only text and closed `details`), the user facing attribute values, and the document title.
 * @param {Element} root
 * @returns {string[]}
 */
export function collectUserFacingStrings(root) {
  const strings = [root.textContent ?? '', document.title];
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const name of USER_FACING_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value) strings.push(value);
    }
  }
  return strings;
}

/**
 * Absolute time that must never reach the farmer price, trend and forecast screens.
 * "May" alone is not listed (it is also an ordinary word); "May 2" is.
 */
export const ABSOLUTE_TIME_PATTERNS = [
  /\b(January|February|March|April|June|July|August|September|October|November|December)\b/,
  /\bMay \d/,
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? ?'?\d/,
  /\b20\d{2}\b/,
  /\d{4}-\d{2}(-\d{2})?/,
  /\d{1,2}\/\d{1,2}\/\d{2,4}/,
  /Updated/,
  /Data up to/,
];

/** Values that show a bug if they ever reach the screen. */
export const BROKEN_VALUE_PATTERNS = [/\bundefined\b/, /\bNaN\b/, /\bnull\b/];

/**
 * Fail with the offending strings when the tree shows an absolute date or a broken value.
 * @param {Element} root
 * @param {string} [state]  name of the screen state, for the failure message
 */
export function expectNoAbsoluteTime(root, state = '') {
  const strings = collectUserFacingStrings(root);
  const offending = strings.flatMap((text) =>
    [...ABSOLUTE_TIME_PATTERNS, ...BROKEN_VALUE_PATTERNS].flatMap((pattern) => {
      const match = pattern.exec(text);
      if (!match) return [];
      const around = text.slice(Math.max(0, match.index - 60), match.index + 60);
      return [`${pattern} in …${JSON.stringify(around)}…`];
    }),
  );
  expect(offending, `${state}\n${offending.join('\n')}`).toEqual([]);
}
