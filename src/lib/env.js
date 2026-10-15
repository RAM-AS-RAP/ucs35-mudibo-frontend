/**
 * Environment validation. Runs once at startup (src/main.jsx); on failure the app
 * renders a full page configuration error instead of crashing.
 *
 * VITE_API_BASE_URL is the API origin only (for example http://localhost:8000).
 * The paths in docs/backend/openapi.json already start with /api/v1, so the base URL
 * must NOT include /api/v1, otherwise every request would have a duplicated prefix.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * @typedef {object} AppConfig
 * @property {string} apiBaseUrl  API origin without a trailing slash
 * @property {boolean} showApiStatus
 */

/**
 * @param {Record<string, string | boolean | undefined>} rawEnv usually import.meta.env
 * @returns {{ ok: true, config: AppConfig } | { ok: false, errors: string[] }}
 */
export function validateEnv(rawEnv) {
  /** @type {string[]} */
  const errors = [];
  const raw = typeof rawEnv.VITE_API_BASE_URL === 'string' ? rawEnv.VITE_API_BASE_URL.trim() : '';

  if (!raw) {
    errors.push('VITE_API_BASE_URL is not set. Copy .env.example to .env and set the API origin.');
  } else {
    /** @type {URL | null} */
    let url = null;
    try {
      url = new URL(raw);
    } catch {
      errors.push(`VITE_API_BASE_URL is not a valid URL: "${raw}".`);
    }
    if (url) {
      const isLocal = LOCAL_HOSTS.has(url.hostname);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
        errors.push(
          'VITE_API_BASE_URL must use https (plain http is allowed only for localhost and 127.0.0.1).',
        );
      }
      if (raw.endsWith('/')) {
        errors.push('VITE_API_BASE_URL must not end with a slash.');
      }
      if (/\/api\/v1\/?$/.test(url.pathname)) {
        errors.push(
          'VITE_API_BASE_URL must be the API origin without /api/v1 (the API paths already include it).',
        );
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    config: { apiBaseUrl: raw, showApiStatus: rawEnv.VITE_SHOW_API_STATUS === 'true' },
  };
}

/** Result of validating the build's environment. */
export const envResult = validateEnv(import.meta.env);

/** Validated configuration, or safe empty values when validation failed (the app then shows the error screen). */
export const config = envResult.ok ? envResult.config : { apiBaseUrl: '', showApiStatus: false };
