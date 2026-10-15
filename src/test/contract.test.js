import { describe, expect, it } from 'vitest';
import { fixtures, FIXTURE_CONTRACT } from './fixtures';
import { validateResponse } from './openapi';

describe('fixtures match openapi.json', () => {
  for (const [name, target] of Object.entries(FIXTURE_CONTRACT)) {
    it(`${name} matches ${target.method.toUpperCase()} ${target.path} ${target.status}`, () => {
      const result = validateResponse(
        target,
        fixtures[/** @type {keyof typeof fixtures} */ (name)],
      );
      expect(result.errors).toBe('No errors');
      expect(result.valid).toBe(true);
    });
  }
});

describe('the validator catches drift', () => {
  it('rejects a health fixture whose values are not strings', () => {
    expect(validateResponse(FIXTURE_CONTRACT.health, { status: 1 }).valid).toBe(false);
  });

  it('rejects a token response without access_token (resolving $ref)', () => {
    const { access_token: _omit, ...broken } = fixtures.tokenResponse;
    expect(validateResponse(FIXTURE_CONTRACT.tokenResponse, broken).valid).toBe(false);
  });

  it('rejects a profile with a wrong type', () => {
    expect(
      validateResponse(FIXTURE_CONTRACT.userMe, { ...fixtures.userMe, must_change_password: 'no' })
        .valid,
    ).toBe(false);
  });

  it('reports a missing operation', () => {
    expect(() =>
      validateResponse({ path: '/api/v1/nope', method: 'get', status: '200' }, {}),
    ).toThrow(/No GET/);
  });
});
