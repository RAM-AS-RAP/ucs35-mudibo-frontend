# Google sign in (identity v2, prompt 6)

Farmers and buyers can choose "Continue with Google" on the sign in screen (`/login`) and the
registration screen (`/register`) instead of an email, a password and a code. Administrators cannot:
the backend answers 403 `google_not_allowed`, and their screens never offer it. Google sign in is
shown only when `VITE_GOOGLE_CLIENT_ID` is a valid OAuth client ID (ending in
`.apps.googleusercontent.com`); otherwise nothing Google related is rendered, loaded or requested.

## The flow, step by step

1. The sign in or registration screen renders `GoogleSignInSlot`, which lazily loads
   `GoogleSignInButton` (its own chunk) when Google is configured.
2. `useGoogleSignIn` (`src/auth/useGoogleSignIn.js`) loads Google Identity Services with `loadGsi()`
   (`src/lib/google/loadGsi.js`): one `<script src="https://accounts.google.com/gsi/client" async defer>`
   tag in `document.head`, shared by concurrent calls, rejected after a script error or 10 seconds.
3. It asks the API for a nonce: `POST /auth/google/nonce` → `{nonce, expires_in}` (single use, 300
   seconds by default). The nonce is kept in a ref only.
4. It calls `initializeGoogle({nonce, onCredential})` and `renderGoogleButton(container, {width})`
   (`src/lib/google/googleClient.js`, the only code that touches Google's object).
5. The person clicks Google's button and picks an account in Google's popup. Google calls back with
   an ID token (`credential`) that contains the nonce.
6. The callback sends `POST /auth/google` with exactly `{credential, nonce}`, then forgets both.
   The backend verifies the token and the nonce (single use, replay rejected).
7. The answer is a `GoogleAuthResult`:
   - `signed_in`: stored like every other sign in (`completeAuthResult`: `setFromLogin`, `GET /auth/me`,
     the flow cleared), then `getPostLoginPath()` (the intended path inside the role tree, or the role
     home). No password and no code.
   - `role_required`: no account exists for this Google email. The signup token, the Google email and
     name, and the role card chosen on `/register` (if any) go into the in memory flow store
     (`startGoogleFlow`), and `/google/role` opens with only `{from}` in router state.
8. `/google/role` shows "Welcome, <name>", "You are signing up with <email>.", two radio cards with no
   default (preselected only from the registration screen's card), the "You cannot change this later"
   warning and "Create my account".
9. "Create my account" sends `POST /auth/google/complete` with exactly `{signup_token, role}` → 201
   `AuthResult` (`signed_in`): stored as above, then the role home.

### Sequence (for a diagram)

```
Browser (AgriSence)          Google Identity Services          AgriSence API            Database
  | POST /auth/google/nonce ------------------------------------> | store nonce (5 min) --> |
  | <------------------------------------------- {nonce, expires_in}                     |
  | initialize({nonce}) + renderButton --> |                     |                        |
  | person clicks the button ------------> | popup: pick account |                        |
  | <------------------- callback {credential (ID token with nonce)}                       |
  | POST /auth/google {credential, nonce} -----------------------> | verify token + nonce   |
  |                                                              | find user by Google id  |
  |                                                              | or verified email ----> |
  | <-------------------- signed_in {access_token, role, ...}     |  (links Google)        |
  |    or role_required {signup_token, email, name} <------------ |                        |
  | (role_required) POST /auth/google/complete {signup_token, role} -> create user ------> |
  | <---------------------------------------- 201 signed_in       |                        |
  | GET /auth/me (Bearer) ---------------------------------------> | read profile --------> |
```

## What is kept in memory, and for how long

| Secret                  | Where                                         | How long                                                                                  |
| ----------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Nonce                   | a ref in `useGoogleSignIn`                    | until it is sent, replaced (refresh, failure, remount) or the screen unmounts             |
| ID token (`credential`) | a local variable in the callback              | the duration of `POST /auth/google`                                                       |
| Signup token            | the in memory flow store (`src/auth/flow.js`) | until the role is submitted, Cancel, a newer Google sign in, sign out, expiry or a reload |
| Access token            | the session store (`sessionStorage`)          | as for every sign in (`expires_in`, 8 hours by default)                                   |

None of the first three is ever written to `sessionStorage`, `localStorage`, a URL, router or
history state, a TanStack Query key or cache entry, a log, console output or an error message. The
flow store keeps no deadline: the server owns the ticket's expiry (`signup_expires_at`, 10 minutes)
and answers `invalid_or_expired_ticket` after it.

## Nonce refresh rule

- A nonce is fetched before every initialisation, never reused.
- A timer replaces it `expires_in - 60` seconds after it was issued (at least 30 seconds).
- When the tab becomes visible after that deadline (`performance.now()`, never the wall clock), it is
  replaced at once (timers can be paused in background tabs).
- After every callback (success or failure) and after every failed attempt a new nonce is fetched
  before the button is shown again. Nothing is retried automatically.
- Re-initialising with a new nonce is allowed by Google (it may log a warning); the last initialisation
  wins. Each initialisation has a generation number: a callback from an older one, an answer that
  arrives after unmount and a React StrictMode double mount are ignored, so only one initialisation is
  ever active and every timer is cleared on unmount.

## Errors

| Situation                                     | Code                            | What the person sees                                                                                                               | Then                                                  |
| --------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Verification failed, replayed nonce, disabled | 401 `google_sign_in_failed`     | "Google sign in did not work. Please try again or use your email and password."                                                    | new nonce, button again                               |
| Administrator account                         | 403 `google_not_allowed`        | "Administrator accounts sign in with email and password."                                                                          | new nonce, button again (no automatic retry)          |
| Another Google account owns this email        | 409 `google_conflict`           | "A different Google account is already connected to this email. Use that Google account, or sign in with your email and password." | new nonce, button again (no automatic retry)          |
| Google sign in off on the server, keys down   | 503 `google_unavailable`        | "Google sign in is not available right now. Use your email and password."                                                          | the button is hidden for the rest of the page visit   |
| Too many requests                             | 429                             | "Too many attempts. Try again in <wait>." (countdown up to 120 s, approximate above)                                               | "Try again" after the wait, which fetches a new nonce |
| Network failure, timeout                      | `network_error`, `timeout`      | the F0 messages                                                                                                                    | new nonce; "Try again" if the nonce cannot be fetched |
| Script blocked, offline while loading, 10 s   | (`GsiLoadError`)                | "Google sign in could not be loaded. Check your connection or ad blocker, or use your email and password."                         | "Try again" loads the script again                    |
| Offline                                       | (device)                        | the F0 offline message                                                                                                             | the script is not loaded until the device is online   |
| Role step: ticket expired                     | 400 `invalid_or_expired_ticket` | "Your Google sign in expired. Please try again." on `/login`                                                                       | flow cleared                                          |
| Role step: start over                         | 409 `google_retry`              | "Please try signing in with Google again." on `/login`                                                                             | flow cleared                                          |
| Role step: validation                         | 422                             | the message, in the error summary                                                                                                  | the screen stays                                      |
| Role step: reload or direct visit             | (no flow)                       | "Your sign in was interrupted. Please start again." on `/login`                                                                    |                                                       |
| Change password without a password            | 409 `password_not_set`          | "You have not set a password yet. Set one from Sign-in methods." with a link to `/account/password`                                |                                                       |

## One Tap is not used

Only the rendered button is used; `google.accounts.id.prompt()` is never called (a source check and
every Google test enforce it). One Tap would open a prompt on its own on page load, which on a shared
phone suggests an account the current person may not own, competes with the email form, and is
harder to make accessible. The initialisation sets `auto_select: false`, and sign out calls
`disableAutoSelect()` when the library was loaded.

## Accessibility

Google's button is an iframe controlled by Google. This app cannot style it, label it, translate it
or check its contrast, and axe does not see inside it. That is a known limitation. Around it, the app
provides an accessible group (`role="group"`, named by the visible line "Or continue with Google" and
described by the helper text), a container of stable height (no layout jump while loading), a polite
status region ("Signing in with Google", announced once) and an alert region for errors. The role
screen uses keyboard operable radio cards, moves focus to its heading, and moves focus to the error
summary after a server error.

## While signing in

After Google's popup closes, the app waits for `POST /auth/google`, then `GET /auth/me`, then the
home screen's code. So the screen never looks frozen in that time:

- The button's place shows only a spinner (it does not turn with reduced motion). The steps are
  announced in the polite status region but not shown as text: "Signing you in with Google…",
  then, once the backend accepts Google's answer (`onProgress` from `signInWithGoogle`),
  "Welcome back, <name>. Opening your account…" (or "Almost done…" before the role step), and a
  "Still working" line after `SLOW_SIGN_IN_MS` (8 seconds).
- The screen's own form and links are `inert` and greyed out (`onBusyChange`), so a second sign in
  cannot start. A failure gives them back and shows the error as before. There is no Cancel button,
  because the request is already sent.
- `completeAuthResult` starts downloading the role's home screen (`src/auth/preloadHome.js`) while
  the profile loads, for every sign in. Inside the app shell, `PageLoadingState` shows a page shaped
  placeholder until the screen's code arrives.
- After a success, the next nonce is fetched with the progress still showing (`keepProgress`), so
  the Google button does not flash back before the next screen appears.

## Linking and the role

- An existing account with the same verified email is connected to Google automatically on the first
  Google sign in, and keeps its role.
- A new Google account chooses farmer or buyer once; the role never changes. Someone who needs both
  uses a second account with a different email.
- Administrators cannot use Google.
- There is no way to disconnect Google, and no connect button: connecting happens only by signing in
  with Google.

## Sign-in methods and set password screens

- **Sign-in methods** (`/account/security`, farmers and buyers, in the account menu): the email with
  "Verified"; the password as "Set" (link to Change password) or "Not set" (link to Set a password);
  Google as "Connected" or "Not connected" with how it connects and that it cannot be disconnected; a
  short explanation of both methods. Data from `GET /auth/me` (`useMe`).
- **Set a password** (`/account/password`): for an account created with Google. "Email me a code" sends
  `POST /auth/password-reset/request` with the email from `GET /auth/me` (never typed); then the code,
  the new password (8 or more characters, `PasswordRequirements`) and the confirmation go to
  `POST /auth/password-reset/confirm`. On 204 the session ends (older tokens are revoked) and `/login`
  says "Password changed. Please sign in again. You can now sign in with your email, password and a
  code, or continue with Google."
- `/change-password` shows the `password_not_set` message with the link instead of the form when the
  profile says `password_set: false`, and maps the server's 409 the same way.
- Administrators see the Forbidden screen on both pages and keep "Change password" only in their menu.

## Limitations

- Google sign in depends on Google and on a third party script (the only one in this app). Content
  blockers, privacy extensions, a blocked `accounts.google.com` or a strict network block it; the email
  sign in remains the fallback.
- Browsers can block Google's popup; the page must be served with
  `Cross-Origin-Opener-Policy: same-origin-allow-popups` (see `docs/security-headers.md`).
- Google's button cannot be made fully accessible by this app (see above).
- There is no disconnect, and the role chosen the first time is permanent.
- Accounts created with Google start without a password; email sign in needs "Set a password" first.
- The automated tests run against a stub of Google Identity Services (`src/test/googleStub.js`); a real
  Google sign in was not run as part of them. See the manual checks in the README.
