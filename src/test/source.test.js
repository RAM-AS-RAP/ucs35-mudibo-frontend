// Static checks over application source in src/ (tests and test helpers are excluded).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = 'src';

/** @returns {string[]} */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(SRC)
  .map((path) => relative('.', path).split(sep).join('/'))
  .filter((path) => /\.(js|jsx|css)$/.test(path))
  .filter((path) => !path.startsWith('src/test/') && !/\.test\.(js|jsx)$/.test(path));

const sources = files.map((path) => ({ path, text: readFileSync(path, 'utf8') }));

/**
 * @param {RegExp} pattern
 * @param {(path: string) => boolean} [where]
 */
function offenders(pattern, where = () => true) {
  return sources
    .filter(({ path }) => where(path))
    .flatMap(({ path, text }) =>
      text
        .split('\n')
        .map((line, i) => ({ line, i }))
        // Code only: comment lines may name what is forbidden.
        .filter(({ line }) => !/^\s*(\/\/|\/\*|\*)/.test(line))
        .filter(({ line }) => pattern.test(line))
        .map(({ i, line }) => `${path}:${i + 1}: ${line.trim()}`),
    );
}

const inAuthOrApi = (path) => path.startsWith('src/auth/') || path.startsWith('src/api/');

describe('source checks', () => {
  it('scans the application source', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files).toContain('src/api/client.js');
  });

  it('never renders raw HTML', () => {
    expect(offenders(/dangerouslySetInnerHTML/)).toEqual([]);
  });

  it('never uses localStorage for session data', () => {
    expect(offenders(/localStorage/, inAuthOrApi)).toEqual([]);
    expect(
      offenders(/localStorage.*(token|session|auth)|(token|session|auth).*localStorage/i),
    ).toEqual([]);
  });

  it('never uses eval or new Function', () => {
    expect(offenders(/\beval\(|new Function\(/)).toEqual([]);
  });

  it('has no hard coded hex colours outside tokens.css', () => {
    const hex = /(^|[^\w&])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
    expect(offenders(hex, (path) => path !== 'src/styles/tokens.css')).toEqual([]);
  });

  it('calls fetch or XMLHttpRequest only inside src/api', () => {
    const outsideApi = (path) => !path.startsWith('src/api/');
    expect(offenders(/(^|[^\w.])fetch\(|XMLHttpRequest/, outsideApi)).toEqual([]);
  });

  it('has no console output in src/auth and src/api', () => {
    expect(offenders(/console\.(log|info|debug|warn|error|table|dir)\b/, inAuthOrApi)).toEqual([]);
  });

  it('index.html loads no third party scripts, fonts or stylesheets', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)="(https?:)?\/\//);
  });
});
