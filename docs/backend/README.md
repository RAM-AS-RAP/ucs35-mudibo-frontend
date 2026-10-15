# Refreshing the backend contract

`openapi.json` and `frontend_contract.md` in this folder are copies from the backend repository.
The frontend's generated types (`src/api/schema.d.ts`), the contract check and the fixture tests
all read these copies, so refresh them whenever the backend changes its API.

1. In the backend repository, pull the commit you want to target. The backend's own tests
   guarantee that its `docs/openapi.json` matches the running code.
2. Copy the two files here, replacing the old ones:
   - `ucs35-mudibo-backend/docs/openapi.json` to `docs/backend/openapi.json`
   - `ucs35-mudibo-backend/docs/frontend_contract.md` to `docs/backend/frontend_contract.md`
3. Update `SOURCE.md` with the backend commit hash and today's date.
4. Regenerate the types: `npm run gen:types`.
5. Verify: `npm run check:contract` (types current, every endpoint path and method exists) and
   `npm test` (fixtures still match the response schemas; every documented error code has a message).
6. If a test fails, update the fixture, the endpoint function or `src/api/errors.js`. Never weaken a check.
7. Commit the copied files, `SOURCE.md` and `src/api/schema.d.ts` together.

Note: the paths in `openapi.json` already start with `/api/v1`, so `VITE_API_BASE_URL` stays the
API origin only. If a future export drops the prefix from the paths, change the base URL rule in
`src/lib/env.js`, `.env.example`, `README.md` and `CLAUDE.md`, and the base URL test in
`src/api/client.test.js`.
