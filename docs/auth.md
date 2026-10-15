# Authentication (module F1)

How people sign up, sign in, change or reset a password, accept an administrator invitation and
sign out, and what the frontend does with the session. The backend is the authority for every rule
here; the frontend checks the same rules early so people get feedback before submitting.

## Flows

| Flow                           | Screen and path                                                        | Endpoints                                                                                                     | Result                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration                   | `RegisterScreen`, `/register` (public only)                            | `POST /auth/register/farmer` or `/auth/register/buyer`, then `POST /auth/login`, `GET /auth/me`               | Signed in, role home. If the automatic sign in fails: `/login` with "Account created. Please sign in."                                                            |
| Login                          | `LoginScreen`, `/login` (public only)                                  | `POST /auth/login`, then `GET /auth/me`                                                                       | Remembered path (if safe), else role home, or `/change-password` when required                                                                                    |
| Forced change                  | `ChangePasswordScreen`, `/change-password`                             | `POST /auth/change-password`                                                                                  | Session cleared, `/login` with "Password changed. Please sign in again."                                                                                          |
| Voluntary change               | same screen, from the account menu                                     | `POST /auth/change-password`                                                                                  | Same as forced                                                                                                                                                    |
| Forgot password                | `ForgotPasswordScreen`, `/forgot-password` (public only)               | `POST /auth/password-reset/request`                                                                           | Same confirmation for every 202; "Enter the code" opens the reset screen with the email in router state                                                           |
| Reset password                 | `ResetPasswordScreen`, `/reset-password` (with or without a session)   | `POST /auth/password-reset/confirm`, resend: `POST /auth/password-reset/request`                              | `/login` with "Password updated. Please sign in."                                                                                                                 |
| Accept invitation              | `AcceptInviteScreen`, `/accept-invite` (with or without a session)     | `POST /auth/accept-invite`, then `POST /auth/login`, `GET /auth/me`; resend: `POST /auth/invite/request-code` | Signed in as admin, `/admin`. If the sign in fails: `/login` with "Account created. Please sign in."                                                              |
| Startup                        | any protected route                                                    | `GET /auth/me` once for a session restored from `sessionStorage`                                              | Profile refreshed; 401 clears it ("Your session expired. Please sign in again."); network failure keeps it and shows the banner; gives up waiting after 8 seconds |
| Expiry                         | any screen                                                             | none (timer at `expiresAt`, re-check when the tab becomes visible)                                            | Session cleared, `/login` with "Your session expired. Please sign in again."                                                                                      |
| Any 401 on a token route       | any screen                                                             | (client middleware)                                                                                           | Same as expiry                                                                                                                                                    |
| 403 `password_change_required` | any screen                                                             | (client middleware)                                                                                           | Session marked, `/change-password`                                                                                                                                |
| Logout                         | account menu, forced change screen, Forbidden screen, `SignedInNotice` | none (there is no logout endpoint)                                                                            | Session and query cache cleared, `/login` (the notice keeps its screen and shows its form)                                                                        |

```
                 register ──201──> login ──200──> /auth/me ──> role home
                                      │                └──(must_change_password)──> /change-password
   /forgot-password ──202──> /reset-password ──204──> /login (flash)
   /accept-invite ──201──> login ──> /admin
   /change-password ──200 (login_required)──> clear('password_changed') ──> /login (flash)
   restored session ──> /auth/me ──200──> render | ──401──> clear('expired') | ──network──> render + banner
```

## Session rules

- The token lives only in the session store (`src/auth/session.js`, persisted to `sessionStorage` under
  `agrisence.session`). Nothing else is written to storage.
- Passwords exist only in the form state and the request body. The auth screens call the endpoint
  functions directly from their submit handlers instead of `useMutation`, because TanStack Query keeps
  mutation variables (the password) in its mutation cache. A source check enforces this.
- Public auth routes (login, both registrations, password reset request and confirm, accept invite,
  invite request code) never carry an `Authorization` header, and a 401 from them never clears a session
  (`PUBLIC_AUTH_PATHS` in `src/api/client.js`). `GET /auth/me` and `POST /auth/change-password` need the token.
- **Flash messages:** `clear(reason)` leaves a one time, in memory message for the login screen
  (`expired`, `password_changed`, `unauthorized`). `setFlash()` sets one without a session ("Account
  created. Please sign in.", "Password updated. Please sign in."). A sign out leaves an empty, silent flash
  so the login screen does not show its "Please sign in to continue." hint right after it. The login screen
  reads the flash once and consumes it.
- **isSuperAdmin:** `GET /auth/me` (`UserOut`) has no `is_super_admin`, so it stays `false` after a login.
  `setProfile()` reads the flag only if the backend adds it; nothing else sets it in F1 (the development
  role switcher's fake session excepted). See the known gaps in the README.
- While a screen signs someone in, `PublicOnly` does not redirect (`useSignInHold`), so the screen decides
  the destination after the profile has loaded. The hold ends when the screen unmounts.

## Redirect rules (`src/auth/redirects.js`)

`getPostLoginPath(session, fromState)`:

1. `mustChangePassword` → `/change-password`.
2. Otherwise the remembered path from `RequireAuth`'s router state, only if it starts with exactly one
   `/`, has no scheme, backslash or control character, stays on the same origin when resolved, and both
   the path and its fully percent decoded form stay inside the role's own tree (`/farmer`, `/buyer`,
   `/admin`). `//evil.com`, `https://evil.com`, `/%2F%2Fevil.com`, `/farmer/%2e%2e/admin` and another
   role's paths all fall back to the role home.
3. Otherwise the role home. Without a session or for an unknown role: `PUBLIC_HOME` (`/login`).

## Validation

`src/lib/validation.js` mirrors the backend:

- Phone: spaces and dashes removed; `07…`, `01…` (10 digits), `+254…` and `254…` with 7 or 1 after
  `254`; normalised to `254XXXXXXXXX`. Registration sends the normalised number and signs in with it.
- Password length: 8 to 128 for farmers and buyers, 12 to 128 for admins (invitation, and change password
  for an admin). The reset screen uses 8; the server applies the account's own minimum.
- Password must not equal the email, the part before `@`, the name or the phone (case insensitive).
- Registration and change password also need an upper case letter, a lower case letter, a digit and a
  symbol: the backend's Pydantic schemas enforce these on those two routes only (not on reset or
  invitation). The server's common password list is not copied; its 422 is shown on the field.
- Codes: 8 letters and digits, typed in any case, with spaces or one hyphen; `CodeInput` tidies the value
  and the server normalises it again.

## Errors and messages

Messages live in `src/lib/messages.js` (screens) and `src/api/errors.js` (backend codes).

| Situation                                                       | Code                            | Message shown                                                                                                                                                                                                                                    | Where                                    |
| --------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Wrong login (unknown account, wrong password, disabled account) | 401 `invalid_credentials`       | "Incorrect phone number, email or password." Only the password is cleared.                                                                                                                                                                       | Summary                                  |
| Duplicate phone or email on registration                        | 409 `conflict`                  | "An account with these details already exists." with links to sign in and reset the password                                                                                                                                                     | Summary                                  |
| Server validation                                               | 422 `validation_error`          | The `details[].message` of each field (without the "Value error," prefix)                                                                                                                                                                        | On the field and in the summary          |
| Weak password                                                   | 422 `password_too_weak`         | The `reason`                                                                                                                                                                                                                                     | On the password field and in the summary |
| Wrong current password                                          | 400 `wrong_current_password`    | "Your current password is incorrect."                                                                                                                                                                                                            | On the current password field            |
| Bad or expired code                                             | 400 `invalid_or_expired_code`   | "That code is incorrect or has expired." plus "Send me a new code" / "Request a new code" (60 second cooldown). The invitation adds "Too many attempts, or an invitation that expired? Ask the administrator who invited you to send a new one." | Summary                                  |
| Rate limited                                                    | 429 `rate_limited` (or any 429) | "Too many attempts. Try again in N seconds." N from `Retry-After`, 60 without it; the button shows "Try again in N s"                                                                                                                            | Summary and button                       |
| Network failure                                                 | `network_error`                 | "Can't reach AgriSence. Check your internet connection and try again."                                                                                                                                                                           | Summary                                  |
| Timeout (20 s)                                                  | `timeout`                       | "The request took too long. Check your connection and try again."                                                                                                                                                                                | Summary                                  |
| Offline                                                         | (browser)                       | "You are offline. Connect to the internet to continue." Submit disabled.                                                                                                                                                                         | Above the form                           |
| Anything else                                                   | any                             | `getUserMessage(error)` plus "Reference: <request id>"                                                                                                                                                                                           | Summary                                  |

### 422 field mapping

The backend's validation handler (`app/core/errors.py`) reports dotted field names without the
`body` prefix in `fields` and `details: [{field, message}]`; a model level error (for example a new
password equal to the current one) is reported on the field `request`. `src/lib/formErrors.js` maps
these per screen:

| Screen            | Server field → form field                                                     |
| ----------------- | ----------------------------------------------------------------------------- |
| Register          | `name` → name, `phone_number` → phone, `email` → email, `password` → password |
| Login             | `identifier`, `password`                                                      |
| Forgot password   | `email`                                                                       |
| Reset password    | `email`, `code`, `new_password` → password                                    |
| Accept invitation | `email`, `code`, `password`                                                   |
| Change password   | `current_password`, `new_password`, `request` → new password                  |

Unmapped messages go to the summary. `password_too_weak` has no field and goes on the password field.

Nothing reveals whether an account, email, invitation or disabled account exists: login failures share
one message, code requests always show the same confirmation, and every code failure shows the same text.

## Accessibility

- Labels are always visible; forms use `noValidate` with Zod and React Hook Form.
- After a client error focus moves to the first invalid field; after a server error to the
  `FormErrorSummary` (`role="alert"`), whose items link to their fields.
- `CountdownButton` announces the wait once when it starts and once when it ends; the second by second
  text is not in a live region.
- The show or hide password button has a fixed name ("Show password") and `aria-pressed`.
- `usePageTitle` sets "<screen> - AgriSence" and moves focus to the heading on navigation.
- Every auth screen has axe tests in its default state, with client errors and with a server error
  (`src/screens/auth/auth.a11y.test.jsx`).

## Known limitations

- No email verification for farmers and buyers.
- Accounts without an email address cannot reset a forgotten password.
- No refresh tokens: users sign in again after 60 minutes.
- A password change signs the user out (the backend revokes every older token).
- No multi factor authentication.
- The backend's login throttle (by default 5 failures per identifier within a configurable window) is
  kept in memory per backend process, so several server processes each keep their own count.
- `GET /auth/me` does not return `is_super_admin`, so the super admin is not recognised in F1.
