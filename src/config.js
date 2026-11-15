// The one place the API address is read. Set VITE_API_BASE at build time; the default is the sandbox API.
// vite.config.js uses apiBase() too, so the Content-Security-Policy connect-src always names the same host.
export const DEFAULT_API_BASE = 'https://api.sandbox.theshardsgame.com';

// `env` is import.meta.env in the browser, or the loadEnv() result in vite.config.js. No trailing slash.
export function apiBase(env) {
  const raw = String(env?.VITE_API_BASE ?? '').trim() || DEFAULT_API_BASE;
  return raw.replace(/\/+$/, '');
}

export const API_BASE = apiBase(import.meta.env);
