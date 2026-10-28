# Recommended security headers

For the later deployment (no hosting configuration is created in this repository). Set these on every
response that serves the app (`index.html`, assets, `sw.js`, the manifest). Replace the placeholders:

- `https://api.example.com`: the API origin (the value of `VITE_API_BASE_URL`).
- `https://<project>.supabase.co`: the Supabase Storage host that serves listing photos (`image_url`).

## Content Security Policy

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self';
  img-src 'self' data: https://<project>.supabase.co;
  font-src 'self';
  connect-src 'self' https://api.example.com;
  manifest-src 'self';
  worker-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  object-src 'none';
  upgrade-insecure-requests
```

(Send it as one line; it is split here for reading.)

- `default-src 'self'`: nothing loads from other origins unless listed. The app has no third party scripts,
  fonts or CDNs, except Google's sign in library when Google sign in is configured (see the last section).
- `connect-src`: only the app itself and the API origin. Payment prompts go to the phone through the backend,
  so the browser never contacts M-Pesa directly.
- `img-src`: the app, `data:` URIs (small inline images and icons) and the Supabase Storage host.
- `frame-ancestors 'none'`: the app cannot be framed (clickjacking).
- `base-uri 'self'`, `object-src 'none'`, `form-action 'self'`: close common injection paths.

**Style sources need testing.** Radix UI (used by shadcn/ui) and sonner set inline `style` attributes for
positioning and animation, and Vite may inject styles in some setups. Test the production build with the
policy above in report only mode first (`Content-Security-Policy-Report-Only`). If inline style attributes
are blocked, add `'unsafe-inline'` to `style-src` only (never to `script-src`), or use
`style-src-attr 'unsafe-inline'` to limit it to attributes.

## Other headers

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
Cross-Origin-Opener-Policy: same-origin-allow-popups
```

- `Cross-Origin-Opener-Policy` is `same-origin-allow-popups`, never `same-origin`, which breaks Google's
  sign in popup. A deployment without Google sign in may use `same-origin`.

- If a later module lets farmers take a listing photo with the camera through a file input, the input
  does not need the `camera` permission; revisit `Permissions-Policy` only if the camera API is used directly.
- Serve `sw.js` and `index.html` with `Cache-Control: no-cache` so updates are picked up; hashed files in
  `/assets/` can use `Cache-Control: public, max-age=31536000, immutable`.

## Google sign in (identity v2, prompt 6)

**The one documented exception to "no third party scripts":** Google Identity Services,
`https://accounts.google.com/gsi/client`.

- **Reason:** Google sign in needs Google's own library to show its button and popup and to return a
  signed ID token; there is no supported way to do it without that script.
- **Scope:** loaded dynamically by `src/lib/google/loadGsi.js` (the only file that names the address),
  only on the sign in and registration screens, only when `VITE_GOOGLE_CLIENT_ID` is valid, never from
  `index.html`, and never with One Tap. Source checks (`src/test/source.test.js`) and the build check
  (`scripts/check-build.mjs`: not in `index.html`, only in a lazy chunk) enforce it.

When Google sign in is configured, extend the policy above with these sources (from Google's Identity
Services documentation on Content Security Policy; verify them against the current pages before
deployment):

```
script-src  'self' https://accounts.google.com/gsi/client;
frame-src   https://accounts.google.com/gsi/;
connect-src 'self' https://api.example.com https://accounts.google.com/gsi/;
style-src   'self' https://accounts.google.com/gsi/style;
```

and send `Cross-Origin-Opener-Policy: same-origin-allow-popups` (never `same-origin`). Because the
policy uses `default-src 'self'`, `frame-src` must be listed explicitly. Google's button may also set
inline styles; test in report only mode first, as described above.

The deployed address (for example `https://agrisence.example.com`) and the development address
(`http://localhost:5173`) must also be added to the OAuth client's **Authorised JavaScript origins** in
the Google Cloud console, or Google refuses to show the button. Setup: the backend repository's
`docs/google-setup.md`.
