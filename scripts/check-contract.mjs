#!/usr/bin/env node
// npm run check:contract
// (a) The committed src/api/schema.d.ts must equal a fresh generation from docs/backend/openapi.json.
// (b) Every path and method used under src/api/endpoints/ must exist in openapi.json.
// Exits with code 1 and a clear message on any failure.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

const OPENAPI = 'docs/backend/openapi.json';
const SCHEMA = 'src/api/schema.d.ts';
const ENDPOINTS = 'src/api/endpoints';
const CLI = 'node_modules/openapi-typescript/bin/cli.js';

const failures = [];
const normalise = (text) => text.replace(/\r\n/g, '\n').trimEnd();

// (a) Generated types are up to date.
const tmp = mkdtempSync(join(tmpdir(), 'agrisence-contract-'));
try {
  const fresh = join(tmp, 'schema.d.ts');
  execFileSync(process.execPath, [CLI, OPENAPI, '-o', fresh], { stdio: 'pipe' });
  if (normalise(readFileSync(fresh, 'utf8')) !== normalise(readFileSync(SCHEMA, 'utf8'))) {
    failures.push(
      `${SCHEMA} is out of date with ${OPENAPI}. Run "npm run gen:types" and commit the result.`,
    );
  }
} catch (error) {
  failures.push(`Could not generate types from ${OPENAPI}: ${error.message}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// (b) Endpoint paths and methods exist in the contract.
const openapi = JSON.parse(readFileSync(OPENAPI, 'utf8'));
const paths = openapi.paths ?? {};

/** @param {string} dir */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(ENDPOINTS).filter((f) => /\.(js|jsx|mjs)$/.test(f) && !/\.test\./.test(f));
let calls = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const where = relative('.', file).split(sep).join('/');

  for (const match of source.matchAll(
    /\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\(\s*(['"`])([^'"`]*)\2/g,
  )) {
    const [, method, quote, path] = match;
    calls += 1;
    if (quote === '`' && path.includes('${')) {
      failures.push(
        `${where}: ${method} uses a template path "${path}". Use a literal path with params.`,
      );
      continue;
    }
    if (!paths[path]) {
      failures.push(`${where}: ${method} ${path} is not a path in ${OPENAPI}.`);
    } else if (!paths[path][method.toLowerCase()]) {
      failures.push(`${where}: ${method} is not allowed on ${path} in ${OPENAPI}.`);
    }
  }

  for (const match of source.matchAll(/(['"`])(\/api\/[^'"`]*)\1/g)) {
    const path = match[2];
    if (!paths[path]) failures.push(`${where}: path literal ${path} is not in ${OPENAPI}.`);
  }
}

if (failures.length) {
  console.error('check:contract FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `check:contract OK: ${SCHEMA} is current; ${calls} endpoint call(s) in ${files.length} file(s) match ${OPENAPI}.`,
);
