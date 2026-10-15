# ucs35-mudibo-frontend
## Project Title: SHAP-based explainable decision support system for crop price prediction and farmer-buyer linkage among smallholder farmers in Kenya
### Name: Sean Mudibo
### Adm No: 168329
### Capstone Project (Webmasters Kenya)

- ML repository: https://github.com/RAM-AS-RAP/ucs35-mudibo-ml
- Backend repository: https://github.com/RAM-AS-RAP/ucs35-mudibo-backend

The AgriSence web app: crop price forecasts with SHAP explanations and a farmer to buyer marketplace
for smallholder farmers in Kenya. It is a React single page application, installable as a PWA, that
talks to the AgriSence backend API (a separate repository). Payments use the M-Pesa sandbox only.

Current state: module F0 (foundation). The account, farmer, buyer and admin screens are placeholders
that later modules (F1 to F5) replace. See [CLAUDE.md](CLAUDE.md) for the roadmap and status.

## Requirements

- Node.js 24 LTS (see `.nvmrc`; `nvm use` picks it up) and npm 10 or newer.
- The backend running locally or reachable over https, for anything beyond the placeholder screens.

## Setup and run

```bash
npm ci
cp .env.example .env      # then edit VITE_API_BASE_URL if your API is not on localhost:8000
npm run dev               # http://localhost:5173
```

In development a small "Dev: role preview" control (bottom right) opens the farmer, buyer, admin or
super admin shell with a fake in memory session, without a backend login. It never sends a token and
is not included in production builds.

## Scripts

| Script                   | What it does                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`            | Vite dev server                                                                                                                     |
| `npm run build`          | Production build into `dist/`                                                                                                       |
| `npm run preview`        | Serve the production build                                                                                                          |
| `npm run lint`           | ESLint                                                                                                                              |
| `npm run format`         | Prettier                                                                                                                            |
| `npm test`               | Unit, component, accessibility and contract tests (Vitest)                                                                          |
| `npm run gen:types`      | Generate `src/api/schema.d.ts` from `docs/backend/openapi.json`                                                                     |
| `npm run gen:icons`      | Generate the PWA icons from `public/favicon.svg`                                                                                    |
| `npm run check:contract` | Fail if the generated types are stale or an endpoint path or method is not in the contract                                          |
| `npm run check:build`    | After a build: check the manifest, the service worker (no API caching), no dev code, no source maps, and the JavaScript size budget |
| `npm run e2e`            | Placeholder: end to end tests arrive in F5                                                                                          |

## Environment variables

Only public values; this repository holds no secrets.

| Variable               | Example                 | Meaning                                                                                                                     |
| ---------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`    | `http://localhost:8000` | The API **origin**, without `/api/v1` and without a trailing slash. Must be https except for `localhost` and `127.0.0.1`.   |
| `VITE_SHOW_API_STATUS` | `false`                 | `true` shows the API and database health indicator on the login screen in a production build (always shown in development). |

**API prefix decision:** the paths in `docs/backend/openapi.json` already start with `/api/v1`
(for example `/api/v1/health`), so the base URL is the origin only and the final URL is
`http://localhost:8000/api/v1/health`. Adding `/api/v1` to the base URL would duplicate the prefix, so the
app rejects it at startup. If the environment is invalid the app shows a full page configuration error.

## Refreshing the backend contract

Copy `docs/openapi.json` and `docs/frontend_contract.md` from the backend repository into
`docs/backend/`, update `docs/backend/SOURCE.md`, then run `npm run gen:types`, `npm run check:contract`
and `npm test`. Details: [docs/backend/README.md](docs/backend/README.md).

## Folder structure

```
src/
  screens/      one file per screen: auth/, farmer/, buyer/, admin/, shared/
  components/   ui/ (shadcn/ui), layout/, feedback/, display/
  api/          client.js, errors.js, endpoints/, schema.d.ts (generated)
  auth/         session.js, guards.jsx, roles.js
  lib/          env.js, format.js, queryClient.js, utils.js
  styles/       tokens.css (all colours), index.css
  dev/          development only role preview
  test/         test setup, MSW handlers, fixtures, helpers
scripts/        contract and build checks
docs/           backend contract, architecture, design system, security headers
public/         icons (placeholder leaf mark) and static files
```

## PWA scope

AgriSence can be installed on a phone's home screen, and its static files (the app shell) are cached so it
opens quickly. API responses are never cached, so prices, forecasts, listings and orders always come live
from the server; offline, the app only shows a message that a connection is needed.

## Documentation

- [CLAUDE.md](CLAUDE.md): conventions, rules and module status (also for AI assistants)
- [docs/architecture.md](docs/architecture.md): data flow, session and guards, errors, PWA caching
- [docs/design-system.md](docs/design-system.md): tokens, usage rules, contrast ratios
- [docs/security-headers.md](docs/security-headers.md): headers for the later deployment
- [docs/backend/](docs/backend/): the backend contract and how to refresh it

## Open items

- `docs/backend/SOURCE.md`: fill in the backend commit hash and export date of the copied contract.
- `public/favicon.svg` and the generated icons are a placeholder mark; replace with the final logo and run `npm run gen:icons`.
- Ask the backend team to add the frontend's development (`http://localhost:5173`) and production origins to `CORS_ORIGINS`.
- `/auth/me` does not return `is_super_admin`; F1 implements the admin users lookup described in the contract.

## Troubleshooting

If `npm test` crashes with "out of memory" on a machine with little free RAM, run the tests in one worker:
`npx vitest run --pool=threads --maxWorkers=1`.
