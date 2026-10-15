import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Run axe on a container and fail with a readable list of violations.
 * Colour contrast is checked by src/styles/tokens.test.js instead (jsdom has no layout or paint).
 * @param {Element} container
 * @param {{ page?: boolean }} [options]  page: true also checks page level rules (landmarks)
 */
export async function expectNoAxeViolations(container, { page = false } = {}) {
  const results = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
      region: { enabled: page },
      'landmark-one-main': { enabled: page },
      'page-has-heading-one': { enabled: page },
    },
  });
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}
