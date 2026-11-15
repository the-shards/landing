// Shared code for the account pages (signup, login, download): the API client, the session, validation and
// the mapping from server answers to plain messages. No DOM work, so it runs the same in the browser and under test.
// Plain ASCII only: the pixel fonts have no other glyphs.
import { API_BASE } from '../../config.js';

export const SESSION_KEY = 'shards.session';
export const DEFAULT_NEXT = '/download';

export const USERNAME_RULE = 'Username: 3 to 32 characters, letters, numbers, - and _ only, and not starting with guest_ or char_.';
export const PASSWORD_RULE = 'Password: 8 to 72 characters.';

// ---- validation (mirrors the server) ----

export function validateUsername(name) {
  const v = String(name ?? '');
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(v)) return USERNAME_RULE;
  const lower = v.toLowerCase();
  if (lower.startsWith('guest_') || lower.startsWith('char_')) return USERNAME_RULE;
  return '';
}

export function validatePassword(pw) {
  const len = [...String(pw ?? '')].length;
  return len >= 8 && len <= 72 ? '' : PASSWORD_RULE;
}

// Invitation codes are shown as XXXX-XXXX-XXXX-XXXX but people type lower case, spaces or no dashes.
// The server normalises too; this is for the "is anything there" check and for tests.
export function normalizeInvite(code) {
  return String(code ?? '').replace(/[\s-]+/g, '').toUpperCase();
}

// Returns {field: message} for every problem; an empty object means the form is fine.
export function validateRegistration({ username, password, confirm, invite, inviteRequired = true }) {
  const errors = {};
  const u = validateUsername(username);
  if (u) errors.username = u;
  const p = validatePassword(password);
  if (p) errors.password = p;
  else if (password !== confirm) errors.confirm = 'The two passwords are not the same.';
  if (inviteRequired && !normalizeInvite(invite)) errors.invite = 'Enter your invitation code.';
  return errors;
}

// ---- safe redirect target ----

// Only a same-site path is accepted: one leading "/", no second slash or backslash, no scheme, no control characters.
export function safeNext(next, fallback = DEFAULT_NEXT) {
  if (typeof next !== 'string' || next === '') return fallback;
  if (!/^\/(?![/\\])[^\\\x00-\x1f\x7f]*$/.test(next)) return fallback;
  return next;
}

// ---- session ----

export function defaultStorage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function saveSession(storage, { token, username, player_id }) {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify({ token, username, player_id }));
  } catch { /* storage blocked: the player will have to log in again */ }
}

export function loadSession(storage) {
  try {
    const s = JSON.parse(storage.getItem(SESSION_KEY));
    if (s && typeof s.token === 'string' && s.token && typeof s.username === 'string') return s;
  } catch { /* nothing stored, or not ours */ }
  return null;
}

export function clearSession(storage) {
  try {
    storage.removeItem(SESSION_KEY);
  } catch { /* nothing to clear */ }
}

// ---- errors ----

export class AccountError extends Error {
  constructor(kind, status, message, extra = {}) {
    super(message);
    this.name = 'AccountError';
    this.kind = kind; // network, invalid, unauthorized, forbidden, invite_required, unavailable, notfound, conflict, rate_limited, server
    this.status = status;
    this.retryAfter = extra.retryAfter ?? null;
  }
}

function kindFor(status, code) {
  if (status === 400) return 'invalid';
  if (status === 401) return 'unauthorized';
  if (status === 403) return code === 'invite_required' ? 'invite_required' : 'forbidden';
  if (status === 404) return code === 'launcher_unavailable' ? 'unavailable' : 'notfound';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  return 'server';
}

const WAIT = 'Too many attempts, wait a moment and try again';

export function messageFor(context, kind, retryAfter = null) {
  if (kind === 'network') return 'Cannot reach the server';
  if (kind === 'rate_limited') {
    return context === 'login' && retryAfter ? `Too many attempts, try again in ${retryAfter} seconds` : WAIT;
  }
  if (context === 'register') {
    if (kind === 'invite_required') return 'A valid invitation code is required';
    if (kind === 'conflict') return 'That username is taken';
    if (kind === 'invalid') return `${USERNAME_RULE} ${PASSWORD_RULE}`;
  }
  if (context === 'login') {
    if (kind === 'unauthorized') return 'Wrong username or password';
    if (kind === 'forbidden') return 'This account cannot sign in';
  }
  if (context === 'download') {
    if (kind === 'unauthorized') return 'Your session has ended, log in again';
    if (kind === 'unavailable') return 'The launcher is not published yet. Try again soon.';
  }
  return 'Something went wrong, try again in a moment';
}

export function parseRetryAfter(value) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---- formatting and display ----

export function formatSizeMB(bytes) {
  return `${(Number(bytes) / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- the client ----

export function createAccountApi({ fetch: fetchFn = globalThis.fetch?.bind(globalThis), base = API_BASE, storage = defaultStorage() } = {}) {
  async function request(context, path, { method = 'GET', body, token } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetchFn(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new AccountError('network', 0, messageFor(context, 'network'));
    }
    let data = null;
    try {
      data = await res.json();
    } catch { /* an error answer may have no body */ }
    if (!res.ok) {
      const kind = kindFor(res.status, data?.code);
      const retryAfter = parseRetryAfter(res.headers?.get?.('Retry-After'));
      throw new AccountError(kind, res.status, messageFor(context, kind, retryAfter), { retryAfter });
    }
    return data;
  }

  function sessionFrom(data, context) {
    if (!data || typeof data.token !== 'string' || !data.token) throw new AccountError('server', 0, messageFor(context, 'server'));
    const session = { token: data.token, username: String(data.username ?? ''), player_id: data.player_id };
    saveSession(storage, session);
    return session;
  }

  return {
    session: () => loadSession(storage),
    logout: () => clearSession(storage),

    // Whether the signup form needs a code. If the call fails, ask for one (the safe default).
    async inviteRequired() {
      try {
        const data = await request('registration', '/api/auth/registration');
        return data?.invite_required !== false;
      } catch {
        return true;
      }
    },

    async register({ username, password, invite }) {
      const data = await request('register', '/api/auth/register', {
        method: 'POST',
        body: { username, password, invite_code: String(invite ?? '') },
      });
      return sessionFrom(data, 'register');
    },

    async login({ username, password }) {
      const data = await request('login', '/api/auth/login', { method: 'POST', body: { username, password } });
      return sessionFrom(data, 'login');
    },

    // A 401 means the token is dead: the session is dropped so the page can send the player to log in.
    async authed(path, method) {
      const session = loadSession(storage);
      if (!session) throw new AccountError('unauthorized', 401, messageFor('download', 'unauthorized'));
      try {
        return await request('download', path, { method, token: session.token });
      } catch (err) {
        if (err.kind === 'unauthorized') clearSession(storage);
        throw err;
      }
    },

    launcherInfo() {
      return this.authed('/api/downloads/launcher/info', 'GET');
    },

    // Asks for a short-lived ticket and returns the full URL to navigate to (the browser downloads it itself).
    async launcherDownloadUrl() {
      const data = await this.authed('/api/downloads/launcher/ticket', 'POST');
      const url = data?.url;
      if (typeof url !== 'string' || !/^\/api\/downloads\/[^\\\s]*$/.test(url)) {
        throw new AccountError('server', 0, messageFor('download', 'server'));
      }
      return `${base}${url}`;
    },
  };
}
