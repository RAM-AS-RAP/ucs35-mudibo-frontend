# CLAUDE.md: guide for AI coding assistants

## 1. Project

AgriSence frontend (`ucs35-mudibo-frontend`): a React single page application and installable PWA.
It is part of a thesis on SHAP explainable crop price forecasting and farmer to buyer linkage for
smallholder farmers in Kenya; payments run in the Safaricom M-Pesa sandbox only (no real money).
The backend is a separate, finished repository; its contract is copied into `docs/backend/`.

Roles: `farmer` (prices, forecasts, listings, orders on their listings), `buyer` (browse, order, pay),
`admin` (moderation, users, orders, payments, forecast accuracy; the super admin also manages invites).

| Module | Scope                                                                                                    | Status      |
| ------ | -------------------------------------------------------------------------------------------------------- | ----------- |
| F0     | Foundation: scaffold, tooling, API layer, session, guards, shells, design system, PWA shell, tests, docs | Done        |
| F1     | Authentication: login, register, password change and reset, accept invite, super admin lookup            | Not started |
| F2     | Farmer: prices, forecast with SHAP bars, listings, orders on my listings                                 | Not started |
| F3     | Buyer: browse, listing detail, checkout, M-Pesa payment polling, my orders                               | Not started |
| F4     | Admin: dashboard, users, invites, moderation, orders, payments, reconciliation, accuracy                 | Not started |
| F5     | Polish: end to end tests (Playwright), performance, accessibility review                                 | Not started |

Update this table at the end of every module.

## 2. Stack and commands

Node 24 LTS (`.nvmrc`), npm. JavaScript only (`.js`, `.jsx`), no TypeScript source files.

| Package                   | Version | Package                                           | Version                       |
| ------------------------- | ------- | ------------------------------------------------- | ----------------------------- |
| react, react-dom          | 19.3.1  | vite                                              | 8.3.4                         |
| react-router              | 8.4.0   | @vitejs/plugin-react                              | 6.1.2                         |
| @tanstack/react-query     | 5.104.3 | tailwindcss, @tailwindcss/vite                    | 4.3.3                         |
| openapi-fetch             | 0.17.0  | tw-animate-css                                    | 1.4.0                         |
| radix-ui                  | 1.8.1   | vite-plugin-pwa                                   | 2.0.0 (workbox 7.4.1)         |
| class-variance-authority  | 0.7.1   | @vite-pwa/assets-generator                        | 2.0.0                         |
| clsx                      | 2.1.1   | openapi-typescript                                | 7.13.0                        |
| tailwind-merge            | 3.7.0   | typescript (types only)                           | 5.9.3                         |
| lucide-react              | 1.57.0  | vitest                                            | 5.0.5                         |
| sonner                    | 2.0.8   | jsdom                                             | 29.1.1                        |
| workbox-window            | 7.4.1   | @testing-library/react, dom, jest-dom, user-event | 16.3.3, 10.4.2, 7.0.1, 14.6.8 |
| eslint, @eslint/js        | 9.39.5  | msw                                               | 3.0.3                         |
| eslint-plugin-react       | 7.37.5  | axe-core                                          | 4.14.0                        |
| eslint-plugin-react-hooks | 7.1.1   | ajv                                               | 8.20.0                        |
| eslint-plugin-jsx-a11y    | 6.10.2  | prettier                                          | 3.9.10                        |
| globals                   | 17.13.0 |                                                   |                               |

Version and dependency decisions:

- **ESLint 9, not 10:** `eslint-plugin-react` and `eslint-plugin-jsx-a11y` declare peer support up to ESLint 9.
  Move to 10 when both support it.
- **TypeScript 5, not 7:** `openapi-typescript` 7 requires `typescript ^5`. TypeScript is used only for
  type generation and editor checking of JSDoc (`checkJs`), never for source files.
- **jsdom 29, not 30:** jsdom 30 requires Node 24.15 or newer; 29 works on every Node 24 release.
- **axe-core directly** (`src/test/axe.js`) instead of `vitest-axe`, which has not been maintained since 2022.
- **shadcn/ui runtime packages** (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`,
  `lucide-react`, `sonner`, `tw-animate-css`) are what the shadcn components need. The shadcn CLI downloads
  from ui.shadcn.com, which F0's network rules did not allow, so the components were written by hand from
  the shadcn sources. `components.json` is set up for JavaScript if you want to use the CLI later.
- **workbox-window**: needed by `virtual:pwa-register/react`.

```bash
npm ci                    # install exactly from package-lock.json
npm run dev               # dev server (needs .env with VITE_API_BASE_URL)
npm run build             # production build in dist/
npm run preview           # serve dist/
npm run lint              # ESLint (react, react-hooks, jsx-a11y; react/no-danger is an error)
npm run format            # Prettier
npm test                  # Vitest, run mode
npm run gen:types         # docs/backend/openapi.json -> src/api/schema.d.ts
npm run gen:icons         # public/favicon.svg -> PWA icons in public/
npm run check:contract    # schema.d.ts current, endpoint paths and methods exist in openapi.json
npm run check:build       # after build: manifest, no runtime caching, no dev code, JS budget
```

## 3. Structure and conventions

```
src/
  screens/      auth/, farmer/, buyer/, admin/, shared/   one screen per file, default export, *Screen.jsx
  components/   ui/ (shadcn), layout/, feedback/, display/   named exports
  api/          client.js, errors.js, endpoints/<area>.js, schema.d.ts (generated, do not edit)
  auth/         session.js, guards.jsx, roles.js
  lib/          env.js, format.js, queryClient.js, utils.js
  styles/       tokens.css (all colours), index.css
  dev/          DevRoleSwitcher.jsx (development only)
  test/         setup.js, msw/, fixtures/, helpers (render, axe, openapi, contrast)
  App.jsx, main.jsx, routes.jsx (the single route table)
scripts/        check-contract.mjs, check-build.mjs, tokens.mjs
docs/           backend/, architecture.md, design-system.md, security-headers.md
```

- Import with the `@/` alias (`@/api/endpoints`). Tests sit next to the code as `*.test.js(x)`.
- Types come from `schema.d.ts` through JSDoc:
  `/** @param {import('@/api/schema').components['schemas']['OrderOut']} order */`.
- Role areas are lazy loaded in `routes.jsx`; keep role specific code under its role folder.

## 4. API rules

- Every backend call is a function in `src/api/endpoints/<area>.js` using `api` from `src/api/client.js`,
  called from TanStack Query hooks. Screens never call `fetch`.
- Use literal paths from `openapi.json` (`api.GET('/api/v1/orders/{order_id}', { params: { path: { order_id } } })`).
- **Base URL rule:** the OpenAPI paths already include `/api/v1`, so `VITE_API_BASE_URL` is the API origin
  only (`http://localhost:8000`, no trailing slash, https except localhost). A test asserts the health URL is
  exactly `http://localhost:8000/api/v1/health`.
- Errors: the client throws `ApiError` (`status`, `code`, `message`, `reason`, `requestId`, `retryAfter`, `fields`,
  `details`). Branch on `code`, show `getUserMessage(error)` and the "Reference" from `getUserMessageDetails`.
  New backend codes go into `ERROR_MESSAGES` in `src/api/errors.js`.
- Contract workflow: copy `openapi.json` and `frontend_contract.md` into `docs/backend/` (see
  `docs/backend/README.md`), run `npm run gen:types`, then `npm run check:contract` and `npm test`.
- `/auth/me` returns no `is_super_admin`; use the admin users lookup from the contract and `setSuperAdmin()`.
- The backend is the single authority for roles, prices, totals, stock and order state. Show `can_pay` /
  `can_cancel` and server totals as returned; never recompute them.

## 5. Security rules

- The token lives only in the session store (`src/auth/session.js`, persisted to `sessionStorage`).
  Never put it in `localStorage`, a URL, a log line or a query key.
- Never render raw HTML (`dangerouslySetInnerHTML` is a lint error and a test failure). No `eval`.
- No third party scripts, fonts, CDNs or analytics. No secrets in this repository (only the public API address).
- Any 401 outside the public auth routes logs out (handled in the client middleware).
- The dev role switcher's fake session never carries a token and never ships in production.

## 6. UI rules

- Colours only through tokens (`src/styles/tokens.css`); no hex colours elsewhere in `src/`.
- Never colour alone: pair it with an icon or sign and a word (`DeltaTag`, `StatusBadge`).
- Touch targets at least 44 by 44 px; phone first, no horizontal scroll at 360 px; inputs at 16 px or more.
- English only. Keep user facing strings in the component or `src/api/errors.js` so they are easy to find.
- Money and dates only through `src/lib/format.js` (KES, Africa/Nairobi time).

## 7. PWA rules

- The service worker precaches the build's static files only, with `index.html` as navigation fallback.
- Never add `runtimeCaching` or cache API responses or images anywhere (stale prices mislead; account data
  is private). `npm run check:build` enforces this.

## 8. Testing rules

- Every screen gets an axe test (`expectNoAxeViolations` from `src/test/axe.js`) and an MSW backed behaviour test.
- MSW handlers live in `src/test/msw/handlers.js`; fixtures in `src/test/fixtures/` must be registered in
  `FIXTURE_CONTRACT` so `src/test/contract.test.js` validates them against `openapi.json`.
- Keep the source checks (`src/test/source.test.js`) and the contrast test passing.
- On machines with little free memory run `npx vitest run --pool=threads --maxWorkers=1`.

## 9. Definition of done (per module)

`npm run lint`, `npm run check:contract`, `npm test`, `npm run build` and `npm run check:build` all pass;
the docs and the status table above are updated; no TODO is left without an entry in the README's
"Open items" section.

## 10. Do not

- Add a dependency without recording it and the reason in section 2.
- Bypass the API layer, or call an endpoint that is not in `openapi.json`.
- Weaken a check, a test or a lint rule to make it pass.
- Commit `.env` or any secret, or add deployment or hosting configuration without being asked.
