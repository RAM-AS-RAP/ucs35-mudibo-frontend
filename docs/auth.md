# Authentication (F1, identity v2 prompt 4)

Accounts are identified only by a verified email address. Farmers and buyers register with name,
email and password and confirm the email with a one time code. A password sign in may need a second
step (a code emailed after the password was checked). Administrators are invited by email only.
Phone numbers no longer exist on accounts or invitations: a phone number is entered only on the
buyer's pay screen, for that payment (see `docs/buyer-checkout.md`). There is no Google sign in yet.

## Flows

| Flow                                              | Screens                                               | Endpoints, in order                                                                                                                                                                                     |
| ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Register                                          | `/register` → `/register/verify` → role home          | `POST /auth/register/farmer` or `/buyer` (202, `registration_token`), `POST /auth/register/verify` (201 `AuthResult` `signed_in`), `GET /auth/me`. Resend: `POST /auth/register/resend` (always 202)    |
| Sign in with a code                               | `/login` → `/login/code` → intended path or role home | `POST /auth/login` (200 `AuthResult` `code_required`), `POST /auth/login/verify` (200 `signed_in`), `GET /auth/me`. Resend: `POST /auth/login/resend`                                                   |
| Sign in without a code (roles the server exempts) | `/login` → intended path or role home                 | `POST /auth/login` (200 `AuthResult` `signed_in`), `GET /auth/me`                                                                                                                                       |
| Accept an invitation                              | `/accept-invite` → `/admin`                           | `POST /auth/accept-invite` (201 `AuthResult` `signed_in`), `GET /auth/me`. New code: `POST /auth/invite/request-code` (always 202). `login` is never called afterwards (it would ask for a second code) |
| Forgot and reset password                         | `/forgot-password` → `/reset-password` → `/login`     | `POST /auth/password-reset/request` (always 202), `POST /auth/password-reset/confirm` (204). The next sign in asks for a code                                                                           |
| Change password                                   | `/change-password` → `/login`                         | `POST /auth/change-password` (200, `login_required: true`). The session is cleared with the `password_changed` flash                                                                                    |
| Expiry                                            | any → `/login`                                        | The session ends after `expires_in` seconds (8 hours by default) with the `expired` flash. No refresh token                                                                                             |
| Logout                                            | any → `/login`                                        | No backend call: `session.clear('logout')`, which also clears the query cache and the flow store                                                                                                        |

Every response that signs someone in is an `AuthResult`. `status` is `signed_in` (with
`access_token`, `expires_in`, `role`, `must_change_password`, `is_super_admin`) or `code_required`
(with `challenge_token`, `email_masked`, `code_expires_at`, `resend_available_in`, `code_sent`).
Fields that do not apply are omitted. Both statuses are handled for every role and every endpoint
that returns `AuthResult` (`completeAuthResult` in `src/auth/auth.js`): `signed_in` stores the session
(`session.setFromLogin`), loads the profile with `GET /auth/me` (a failed profile keeps the session),
then clears the flow; `code_required` starts a login flow and the screen opens `/login/code`.

```
/login ──password──> POST /auth/login ──signed_in──> getPostLoginPath()
                                       └─code_required──> /login/code ──code──> POST /auth/login/verify ──> getPostLoginPath()
/register ──> POST /auth/register/{role} ──202──> /register/verify ──code──> POST /auth/register/verify ──> role home
restored session ──> /auth/me ──200──> render | ──401──> clear('expired') | ──network──> render + banner
```

## The in memory flow store (`src/auth/flow.js`)

The registration token and the sign in challenge token are secrets for one flow. They live only in
the module memory of `src/auth/flow.js`:
`{kind: 'login' | 'register', token, emailMasked, resendDeadline, expiresDeadline, codeSent}`.

- `startFlow(kind, {token, emailMasked, resendAvailableInSeconds, codeSent})`, `updateResend(seconds)`,
  `getFlow(kind)` (with the token, used only by `src/auth/auth.js`), `getFlowView(kind)` and
  `useFlowView(kind)` (without the token, for screens), `clearFlow()`, `resendRemainingSeconds()`.
- The resend deadline and the code validity use `performance.now()` (a monotonic clock), so a changed
  device clock or a remounted screen cannot break the countdown. The countdown starts from the
  server's `resend_available_in`, and from `Retry-After` after a 429 `resend_cooldown`.
- The store is cleared by `session.clear()` (logout and expiry), after a successful sign in, on "Start
  again" and on `challenge_closed`. Nothing persists it, so a reload loses the flow: the code screens
  then go back to their start screen with the `flow_lost` or `registration_lost` message. That is
  intended: a token in storage or a URL could be read by anyone with access to the device or the
  browser history.
- **Secrets rule:** passwords, one time codes, the registration token and the challenge token are
  never written to `sessionStorage` or `localStorage`, a URL, router state, `window.history.state`, a
  query key, a log, console output or an error message. Passwords and codes exist only in form state
  and the request body; the tokens only in the flow store. Router state carries only `{from}` (the
  intended path) from `/login` to `/login/code`, and only the email from `/forgot-password` to
  `/reset-password`.

## Session rules

- The access token lives only in the session store (`src/auth/session.js`, persisted to
  `sessionStorage` under `agrisence.session`) and only after a sign in completed. Nothing else is
  written to storage.
- The auth screens call the endpoint functions directly instead of `useMutation`, because TanStack
  Query keeps mutation variables (the password) in its mutation cache. The code screens carry no
  password but use the same style. A source check enforces this.
- Public auth routes (`PUBLIC_AUTH_PATHS` in `src/api/client.js`: login and its verify and resend,
  both registrations and their verify and resend, password reset request and confirm, accept invite,
  invite request code) never carry an `Authorization` header, and a 401 from them never clears a
  session. `GET /auth/me` and `POST /auth/change-password` need the token.
- **Flash messages:** `clear(reason)` leaves a one time, in memory message for the login screen
  (`expired`, `password_changed`, `unauthorized`); `setFlash()` sets one without a session
  (`challenge_closed`, `flow_lost`, `registration_lost`, "Password updated. Please sign in."). A sign
  out leaves an empty, silent flash. The login and register screens read the flash once and consume it.
- **The profile** in the session holds `name`, `role`, `mustChangePassword`, `isSuperAdmin` and the
  user `id` (`userId`). `setFromLogin()` takes the role, `is_super_admin`, `must_change_password` and
  `expires_in` from the `signed_in` `AuthResult`; `setProfile()` takes the rest from `GET /auth/me`.
  Only `is_super_admin: true` counts, and it only controls what the UI shows.
- While a screen signs someone in, `PublicOnly` does not redirect (`useSignInHold`), so the screen
  decides the destination after the profile has loaded. The hold ends when the screen unmounts.

## Redirect rules (`src/auth/redirects.js`)

`getPostLoginPath(session, fromState)` (unchanged):

1. `mustChangePassword` → `/change-password`.
2. Otherwise the remembered path from `RequireAuth`'s router state, only if it is an internal path
   inside the role's own tree (`//evil.com`, `https://evil.com`, `/%2F%2Fevil.com`,
   `/farmer/%2e%2e/admin` and another role's paths fall back to the role home).
3. Otherwise the role home. Without a session or for an unknown role: `/login`.

The intended path travels from `/login` to `/login/code` as router state `{from}` (`fromState()`),
and back to `/login` when the person has to start again. Registration and invitations always go to
the role home. Signed in users visiting a public page go to their role home; a session with
`mustChangePassword` can only reach `/change-password`. The code screens (`/login/code`,
`/register/verify`) are lazy loaded under `PublicOnly` and redirect to their start screen when their
flow is missing.

## Validation (`src/lib/validation.js`, `src/lib/codes.js`)

- Email: trimmed, at most 254 characters, a valid format, lower cased on submit.
- Password length: 8 to 128 for farmers and buyers, 12 to 128 for admins (invitation, and change
  password for an admin). The reset screen shows the role neutral minimum of 8; the server applies the
  account's own minimum and its reason is shown on the field (422 `password_too_weak`).
- `passwordProblems(password, {role, email, name})`: the password must not equal the email, the part
  before `@` or the name (case insensitive). The server's common password list is not copied.
- Registration and change password also need an upper case letter, a lower case letter, a digit and a
  symbol (the backend's schemas enforce these on those two routes).
- Codes: 8 letters and digits, shown as `XXXX-XXXX`, typed in any case with spaces or one hyphen.
  `normalizeCode` (upper case, no spaces or hyphens) runs in the API layer before sending;
  `isPlausibleCode` checks 8 characters. The exact alphabet is not in `openapi.json`, so any letter or
  digit is accepted and the server decides.
- `normalizePhone` lives in `src/lib/phone.js` and is used only by the payment step.

## Errors and messages

Screen texts live in `src/lib/messages.js`, backend codes in `src/api/errors.js`.

| Situation                                                       | Code                                  | Message shown                                                                                                  | Where                                    |
| --------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Wrong sign in (unknown email, wrong password, disabled account) | 401 `invalid_credentials`             | "Incorrect email or password." Only the password is cleared                                                    | Summary                                  |
| Too many sign in codes requested                                | 429 `too_many_login_codes`            | "Too many sign in codes were requested. Try again in <wait>."                                                  | Summary and button                       |
| Rate limited                                                    | 429 `rate_limited` (or any other 429) | "Too many attempts. Try again in <wait>."                                                                      | Summary and button                       |
| Wrong or expired sign in code                                   | 400 `invalid_or_expired_code`         | "That code is incorrect or has expired." The field is cleared and focused                                      | On the code field                        |
| Wrong or expired registration code                              | 400 `invalid_or_expired_code`         | "That code is incorrect or has expired. Request a new code or start again."                                    | On the code field                        |
| Sign in challenge closed                                        | 400 `challenge_closed`                | The flow is cleared; `/login` shows "Your sign in session ended. Please sign in again."                        | Flash                                    |
| Resend too soon                                                 | 429 `resend_cooldown`                 | "Please wait before asking for another code." The countdown restarts from `Retry-After`                        | Status message                           |
| All resends used                                                | 409 `send_limit_reached`              | "You have used all the code resends. Please start again." The resend control is hidden                         | Summary                                  |
| Reload or direct visit of a code screen                         | (no flow)                             | "Your sign in was interrupted. Please start again." / "Your registration was interrupted. Please start again." | Flash                                    |
| Server validation                                               | 422 `validation_error`                | Each field's message                                                                                           | On the field and in the summary          |
| Weak password                                                   | 422 `password_too_weak`               | "Choose a stronger password." plus the `reason`                                                                | On the password field and in the summary |
| Wrong current password                                          | 400 `wrong_current_password`          | "Your current password is incorrect."                                                                          | On the current password field            |
| Bad reset or invitation code                                    | 400 `invalid_or_expired_code`         | "That code is incorrect or has expired." plus "Send me a new code" / "Request a new code" (60 second cooldown) | Summary                                  |
| Network failure, timeout, offline                               | `network_error`, `timeout`            | The F0 texts; offline disables submission                                                                      | Summary or above the form                |
| Anything else                                                   | any                                   | `getUserMessage(error)`, plus "Reference: <request id>" for 5xx only                                           | Summary                                  |

**Waits** (`<wait>` is `formatWait`): up to 120 seconds count down on the button ("Try again in N s");
longer waits read approximately ("about 10 minutes", "about 2 hours") and the button is re-enabled by a
stored end timestamp checked every 15 seconds and on focus (`useRetryWait`).

Nothing reveals whether an account exists: sign in failures share one message, registration always
answers 202 with the same screen (an existing owner gets a notice email instead of a code, and the
`registration_token` is then a decoy), code requests always show the same confirmation, and every code
failure shows the same text.

### 422 field mapping

| Screen            | Server field → form field                                    |
| ----------------- | ------------------------------------------------------------ |
| Register          | `name`, `email`, `password`                                  |
| Login             | `email`, `password`                                          |
| Code screens      | `code`                                                       |
| Forgot password   | `email`                                                      |
| Reset password    | `email`, `code`, `new_password` → password                   |
| Accept invitation | `email`, `code`, `password`                                  |
| Change password   | `current_password`, `new_password`, `request` → new password |

## Accessibility

- Labels are always visible; forms use `noValidate` with Zod and React Hook Form; inputs are 16 px.
- After a client error focus moves to the first invalid field; after a server error to the
  `FormErrorSummary` (`role="alert"`); after a wrong code back to the cleared code field.
- `usePageTitle` sets "<screen> - AgriSence" and moves focus to the heading when a step opens.
- The code is never submitted automatically, also when pasted.
- The resend control reads "Send a new code in N s" while it waits; screen readers hear "A new code
  was sent." once (the status message) and "You can send a new code now." at the end, never every second.
- The role choice is a group of radio cards, usable with the keyboard only.
- Every auth screen has axe tests in its default, client error and server error states
  (`src/screens/auth/auth.a11y.test.jsx`, `src/screens/auth/codeScreens.test.jsx`).

## Limitations

- Email is now the only identity and a hard dependency of sign in: farmers need an email address they
  can open, and a sign in may wait for an email.
- An interrupted flow (reload, closed tab) must be restarted; the tokens are deliberately not stored.
- Resend limits (cooldown, 3 sends per sign in, 5 codes per registration) are enforced by the server;
  the screen only shows them.
- The sign in and registration screens never reveal whether an account exists.
- No Google sign in yet, no "remember this device", no refresh tokens.
- Whoever controls the mailbox can reset the password and receive sign in codes: a mailbox compromise
  gives access to the account.
- A password change signs the user out (the backend revokes every older token); the next sign in asks
  for a code.
