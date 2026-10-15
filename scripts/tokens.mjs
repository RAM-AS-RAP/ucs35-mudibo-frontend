// Reads colour tokens from src/styles/tokens.css, the single source of design tokens.
// Used by vite.config.js (theme colour, manifest), the contrast test and check-build.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolved from the repository root: npm scripts, Vite and Vitest all run there.
export const TOKENS_PATH = resolve(process.cwd(), 'src/styles/tokens.css');

/**
 * Parse `--name: #hex;` declarations.
 * @param {string} [css]
 * @returns {Record<string, string>} token name (without the leading dashes) to upper case hex
 */
export function readTokens(css = readFileSync(TOKENS_PATH, 'utf8')) {
  /** @type {Record<string, string>} */
  const tokens = {};
  for (const match of css.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[match[1]] = match[2].toUpperCase();
  }
  return tokens;
}
