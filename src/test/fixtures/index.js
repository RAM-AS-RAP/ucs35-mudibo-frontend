// Fixtures shared by MSW handlers and tests. Each one is validated against the
// matching response schema in docs/backend/openapi.json (src/test/contract.test.js).
import health from './health.json';
import dbHealth from './dbHealth.json';
import tokenResponse from './tokenResponse.json';
import userMe from './userMe.json';
import adminMe from './adminMe.json';
import registeredUser from './registeredUser.json';
import passwordChanged from './passwordChanged.json';
import codeRequested from './codeRequested.json';

export const fixtures = {
  health,
  dbHealth,
  tokenResponse,
  userMe,
  adminMe,
  registeredUser,
  passwordChanged,
  codeRequested,
};

/** Fixture name to the OpenAPI response it must match. */
export const FIXTURE_CONTRACT = {
  health: { path: '/api/v1/health', method: 'get', status: '200' },
  dbHealth: { path: '/api/v1/health/db', method: 'get', status: '200' },
  tokenResponse: { path: '/api/v1/auth/login', method: 'post', status: '200' },
  userMe: { path: '/api/v1/auth/me', method: 'get', status: '200' },
  adminMe: { path: '/api/v1/auth/accept-invite', method: 'post', status: '201' },
  registeredUser: { path: '/api/v1/auth/register/farmer', method: 'post', status: '201' },
  passwordChanged: { path: '/api/v1/auth/change-password', method: 'post', status: '200' },
  codeRequested: { path: '/api/v1/auth/password-reset/request', method: 'post', status: '202' },
};
