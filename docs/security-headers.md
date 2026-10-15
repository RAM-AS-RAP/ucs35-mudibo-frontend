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
  fonts or CDNs.
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
Cross-Origin-Opener-Policy: same-origin
```

- If a later module lets farmers take a listing photo with the camera through a file input, the input
  does not need the `camera` permission; revisit `Permissions-Policy` only if the camera API is used directly.
- Serve `sw.js` and `index.html` with `Cache-Control: no-cache` so updates are picked up; hashed files in
  `/assets/` can use `Cache-Control: public, max-age=31536000, immutable`.
