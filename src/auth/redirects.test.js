import { describe, expect, it } from 'vitest';
import { getPostLoginPath } from './redirects';

const farmer = { role: 'farmer', mustChangePassword: false };
const admin = { role: 'admin', mustChangePassword: false };

describe('getPostLoginPath', () => {
  it('goes to /change-password when a change is required, whatever the remembered path', () => {
    expect(
      getPostLoginPath({ ...farmer, mustChangePassword: true }, { from: '/farmer/prices' }),
    ).toBe('/change-password');
  });

  it('goes to the role home without a remembered path', () => {
    expect(getPostLoginPath(farmer, null)).toBe('/farmer');
    expect(getPostLoginPath({ role: 'buyer' }, undefined)).toBe('/buyer');
    expect(getPostLoginPath(admin, {})).toBe('/admin');
  });

  it.each([
    ['/farmer', '/farmer'],
    ['/farmer/prices', '/farmer/prices'],
    ['/farmer/listings?status=active', '/farmer/listings?status=active'],
    ['/farmer/forecast#top', '/farmer/forecast#top'],
  ])('accepts the internal path %s inside the role tree', (from, expected) => {
    expect(getPostLoginPath(farmer, { from })).toBe(expected);
    expect(getPostLoginPath(farmer, from)).toBe(expected);
  });

  it.each([
    '//evil.com',
    '//evil.com/farmer',
    'https://evil.com',
    'https://evil.com/farmer',
    'javascript:alert(1)',
    'evil.com/farmer',
    '/\\evil.com',
    '\\\\evil.com',
    '/%2F%2Fevil.com',
    '%2F%2Fevil.com',
    '/%252F%252Fevil.com',
    '/%5Cevil.com',
    'https%3A%2F%2Fevil.com',
    '/admin',
    '/admin/users',
    '/buyer',
    '/farmerx',
    '/farmer/../admin',
    '/farmer/%2e%2e/admin',
    '/farmer/%252e%252e/admin',
    '/farmer/%2E%2E%2Fadmin',
    '/farmer\n/admin',
    '/%E0%A4%A',
    '',
  ])('rejects %j and falls back to the role home', (from) => {
    expect(getPostLoginPath(farmer, { from })).toBe('/farmer');
  });

  it('rejects a farmer path for an admin, and non string state', () => {
    expect(getPostLoginPath(admin, { from: '/farmer' })).toBe('/admin');
    expect(getPostLoginPath(admin, { from: 42 })).toBe('/admin');
    expect(getPostLoginPath(admin, { from: { pathname: '/admin' } })).toBe('/admin');
  });

  it('returns the public home without a session or for an unknown role', () => {
    expect(getPostLoginPath(null, { from: '/farmer' })).toBe('/login');
    expect(getPostLoginPath({ role: 'owner' }, { from: '/owner' })).toBe('/login');
  });
});
