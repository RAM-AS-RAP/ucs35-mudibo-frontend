/**
 * The only way a listing photo URL reaches an <img>. The backend returns a full URL; anything
 * that is not https (or a local http server during development) is dropped, so a `javascript:`,
 * `data:` or plain http URL is never rendered.
 * @param {unknown} url
 * @param {{ dev?: boolean }} [options]  dev: allow http://localhost and http://127.0.0.1
 * @returns {string | null}
 */
export function safeImageUrl(url, { dev = import.meta.env.DEV } = {}) {
  if (typeof url !== 'string' || url.trim() === '') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol === 'https:') return parsed.href;
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (dev && parsed.protocol === 'http:' && local) return parsed.href;
  return null;
}
