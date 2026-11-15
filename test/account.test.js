// The account logic: validators, error mapping, safe redirects, the session and the download flow (fake fetch and storage).
import { describe, expect, test } from 'vitest';
import {
  AccountError, DEFAULT_NEXT, PASSWORD_RULE, SESSION_KEY, USERNAME_RULE, clearSession, createAccountApi, formatSizeMB,
  loadSession, messageFor, normalizeInvite, safeNext, saveSession, validatePassword, validateRegistration, validateUsername,
} from '../src/lib/account/account.js';
import { apiBase, DEFAULT_API_BASE } from '../src/config.js';

const BASE = 'https://api.test';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    has: (k) => data.has(k),
  };
}

// A fetch that answers from a queue and records what it was asked.
function fakeFetch(...answers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const a = answers.shift();
    if (a instanceof Error) throw a;
    const { status = 200, body = null, headers = {} } = a;
    return { ok: status >= 200 && status < 300, status, json: async () => { if (body === null) throw new Error('no body'); return body; }, headers: { get: (n) => headers[n] ?? null } };
  };
  fn.calls = calls;
  return fn;
}

const SESSION = { token: 'tok123', username: 'ana', player_id: 7 };
const loggedIn = () => fakeStorage({ [SESSION_KEY]: JSON.stringify(SESSION) });

describe('validators', () => {
  test('usernames follow the server rules', () => {
    for (const ok of ['abc', 'Ana_01', 'a-b-c', 'x'.repeat(32)]) expect(validateUsername(ok)).toBe('');
    for (const bad of ['', 'ab', 'x'.repeat(33), 'has space', 'café', 'guest_1', 'Guest_9', 'char_x', 'CHAR_x', 'a.b']) expect(validateUsername(bad)).toBe(USERNAME_RULE);
  });

  test('passwords are 8 to 72 characters', () => {
    expect(validatePassword('1234567')).toBe(PASSWORD_RULE);
    expect(validatePassword('12345678')).toBe('');
    expect(validatePassword('x'.repeat(72))).toBe('');
    expect(validatePassword('x'.repeat(73))).toBe(PASSWORD_RULE);
    expect(validatePassword(undefined)).toBe(PASSWORD_RULE);
  });

  test('invitation codes accept lower case, spaces and missing dashes', () => {
    expect(normalizeInvite(' abcd-efgh 1234-ijkl ')).toBe('ABCDEFGH1234IJKL');
    expect(normalizeInvite('')).toBe('');
    expect(normalizeInvite(null)).toBe('');
  });

  test('a whole registration form', () => {
    const good = { username: 'ana', password: 'longenough', confirm: 'longenough', invite: 'abcd-1234' };
    expect(validateRegistration(good)).toEqual({});
    expect(Object.keys(validateRegistration({ ...good, username: 'a', password: 'short', confirm: 'x', invite: '  ' })).sort()).toEqual(['invite', 'password', 'username']);
    expect(validateRegistration({ ...good, confirm: 'different1' })).toEqual({ confirm: 'The two passwords are not the same.' });
    expect(validateRegistration({ ...good, invite: '', inviteRequired: false })).toEqual({});
  });
});

describe('safeNext', () => {
  test('accepts same-site paths', () => {
    expect(safeNext('/download/')).toBe('/download/');
    expect(safeNext('/download')).toBe('/download');
    expect(safeNext('/fairness/?x=1#verify')).toBe('/fairness/?x=1#verify');
  });
  test('rejects everything that could leave the site', () => {
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil', '\\evil', '', 'download', 'javascript:alert(1)', '/a\\b', '/a\nb', null, undefined, 42]) {
      expect(safeNext(bad)).toBe(DEFAULT_NEXT);
    }
    expect(safeNext('//evil.example', '/x')).toBe('/x');
  });
});

describe('session storage', () => {
  test('save, load, clear', () => {
    const s = fakeStorage();
    expect(loadSession(s)).toBeNull();
    saveSession(s, { ...SESSION, is_admin: true, extra: 'dropped' });
    expect(JSON.parse(s.getItem(SESSION_KEY))).toEqual(SESSION);
    expect(loadSession(s)).toEqual(SESSION);
    clearSession(s);
    expect(loadSession(s)).toBeNull();
  });
  test('garbage or missing storage is just "no session"', () => {
    expect(loadSession(fakeStorage({ [SESSION_KEY]: 'not json' }))).toBeNull();
    expect(loadSession(fakeStorage({ [SESSION_KEY]: '{"username":"x"}' }))).toBeNull();
    expect(loadSession(null)).toBeNull();
    expect(() => saveSession(null, SESSION)).not.toThrow();
    expect(() => clearSession(null)).not.toThrow();
  });
});

describe('error mapping', () => {
  test.each([
    ['register', 'invite_required', 'A valid invitation code is required'],
    ['register', 'conflict', 'That username is taken'],
    ['register', 'invalid', `${USERNAME_RULE} ${PASSWORD_RULE}`],
    ['register', 'rate_limited', 'Too many attempts, wait a moment and try again'],
    ['register', 'network', 'Cannot reach the server'],
    ['login', 'unauthorized', 'Wrong username or password'],
    ['login', 'forbidden', 'This account cannot sign in'],
    ['login', 'network', 'Cannot reach the server'],
    ['download', 'unavailable', 'The launcher is not published yet. Try again soon.'],
    ['download', 'unauthorized', 'Your session has ended, log in again'],
  ])('%s %s', (context, kind, text) => expect(messageFor(context, kind)).toBe(text));

  test('a login lock-out says how long', () => {
    expect(messageFor('login', 'rate_limited', 42)).toBe('Too many attempts, try again in 42 seconds');
    expect(messageFor('login', 'rate_limited')).toBe('Too many attempts, wait a moment and try again');
  });

  test('every message is plain ASCII', () => {
    for (const c of ['register', 'login', 'download']) {
      for (const k of ['network', 'invalid', 'unauthorized', 'forbidden', 'invite_required', 'unavailable', 'notfound', 'conflict', 'rate_limited', 'server']) {
        expect(messageFor(c, k, 5)).toMatch(/^[\x20-\x7e]+$/);
      }
    }
  });
});

describe('the api client', () => {
  test('register posts the contract body and stores the session', async () => {
    const storage = fakeStorage();
    const fetch = fakeFetch({ status: 201, body: { player_id: 7, token: 'tok123', username: 'ana', is_admin: false } });
    const api = createAccountApi({ fetch, base: BASE, storage });
    const s = await api.register({ username: 'ana', password: 'longenough', invite: 'abcd efgh' });
    expect(s).toEqual(SESSION);
    expect(fetch.calls[0].url).toBe(`${BASE}/api/auth/register`);
    expect(fetch.calls[0].init.method).toBe('POST');
    expect(fetch.calls[0].init.headers).toEqual({ 'Content-Type': 'application/json' }); // no bearer on public calls
    expect(JSON.parse(fetch.calls[0].init.body)).toEqual({ username: 'ana', password: 'longenough', invite_code: 'abcd efgh' });
    expect(loadSession(storage)).toEqual(SESSION);
  });

  test.each([
    [403, { error: 'x', code: 'invite_required' }, 'invite_required', 'A valid invitation code is required'],
    [409, { error: 'taken' }, 'conflict', 'That username is taken'],
    [400, { error: 'bad' }, 'invalid', `${USERNAME_RULE} ${PASSWORD_RULE}`],
    [429, { error: 'slow' }, 'rate_limited', 'Too many attempts, wait a moment and try again'],
  ])('register %i', async (status, body, kind, message) => {
    const storage = fakeStorage();
    const api = createAccountApi({ fetch: fakeFetch({ status, body }), base: BASE, storage });
    const err = await api.register({ username: 'ana', password: 'longenough', invite: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(AccountError);
    expect([err.kind, err.status, err.message]).toEqual([kind, status, message]);
    expect(loadSession(storage)).toBeNull();
  });

  test('network failure', async () => {
    const api = createAccountApi({ fetch: fakeFetch(new TypeError('failed')), base: BASE, storage: fakeStorage() });
    const err = await api.login({ username: 'a', password: 'b' }).catch((e) => e);
    expect([err.kind, err.message]).toEqual(['network', 'Cannot reach the server']);
  });

  test('login success and each failure', async () => {
    const storage = fakeStorage();
    const ok = createAccountApi({ fetch: fakeFetch({ body: { ...SESSION, is_admin: false } }), base: BASE, storage });
    expect(await ok.login({ username: 'ana', password: 'pw' })).toEqual(SESSION);
    const cases = [
      [{ status: 401, body: { error: 'x' } }, 'Wrong username or password'],
      [{ status: 403, body: { error: 'banned' } }, 'This account cannot sign in'],
      [{ status: 429, body: { error: 'x' }, headers: { 'Retry-After': '30' } }, 'Too many attempts, try again in 30 seconds'],
      [{ status: 429 }, 'Too many attempts, wait a moment and try again'],
      [{ status: 500 }, 'Something went wrong, try again in a moment'],
    ];
    for (const [answer, message] of cases) {
      const api = createAccountApi({ fetch: fakeFetch(answer), base: BASE, storage: fakeStorage() });
      await expect(api.login({ username: 'a', password: 'b' })).rejects.toThrow(message);
    }
  });

  test('the registration mode decides whether a code is asked for; a failure asks for one', async () => {
    const mk = (a) => createAccountApi({ fetch: fakeFetch(a), base: BASE, storage: fakeStorage() });
    expect(await mk({ body: { mode: 'invite', invite_required: true } }).inviteRequired()).toBe(true);
    expect(await mk({ body: { mode: 'open', invite_required: false } }).inviteRequired()).toBe(false);
    expect(await mk({ status: 500 }).inviteRequired()).toBe(true);
    expect(await mk(new TypeError('offline')).inviteRequired()).toBe(true);
    const f = fakeFetch({ body: { invite_required: false } });
    await createAccountApi({ fetch: f, base: BASE, storage: fakeStorage() }).inviteRequired();
    expect(f.calls[0].url).toBe(`${BASE}/api/auth/registration`);
    expect(f.calls[0].init.method).toBe('GET');
  });

  test('launcher info sends the bearer token', async () => {
    const info = { available: true, file: 'L.exe', version: '0.1.0', size: 6815744, sha256: 'a'.repeat(64), updated_at: 'x' };
    const fetch = fakeFetch({ body: info });
    const api = createAccountApi({ fetch, base: BASE, storage: loggedIn() });
    expect(await api.launcherInfo()).toEqual(info);
    expect(fetch.calls[0].url).toBe(`${BASE}/api/downloads/launcher/info`);
    expect(fetch.calls[0].init.headers.Authorization).toBe('Bearer tok123');
  });

  test('the ticket flow posts with the bearer and returns the full url to navigate to', async () => {
    const fetch = fakeFetch({ body: { url: '/api/downloads/launcher/file?t=abc', expires_in: 120 } });
    const api = createAccountApi({ fetch, base: BASE, storage: loggedIn() });
    expect(await api.launcherDownloadUrl()).toBe(`${BASE}/api/downloads/launcher/file?t=abc`);
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe(`${BASE}/api/downloads/launcher/ticket`);
    expect(fetch.calls[0].init.method).toBe('POST');
    expect(fetch.calls[0].init.headers.Authorization).toBe('Bearer tok123');
  });

  test('a ticket url that points anywhere else is refused', async () => {
    for (const url of ['https://evil.example/x', '//evil.example/x', '/other', undefined]) {
      const api = createAccountApi({ fetch: fakeFetch({ body: { url } }), base: BASE, storage: loggedIn() });
      await expect(api.launcherDownloadUrl()).rejects.toBeInstanceOf(AccountError);
    }
  });

  test('a 401 clears the session; so does an expired token on the ticket call', async () => {
    for (const call of ['launcherInfo', 'launcherDownloadUrl']) {
      const storage = loggedIn();
      const api = createAccountApi({ fetch: fakeFetch({ status: 401, body: { error: 'expired' } }), base: BASE, storage });
      const err = await api[call]().catch((e) => e);
      expect(err.kind).toBe('unauthorized');
      expect(storage.has(SESSION_KEY)).toBe(false);
    }
  });

  test('404 launcher_unavailable keeps the session and says so', async () => {
    const storage = loggedIn();
    const api = createAccountApi({ fetch: fakeFetch({ status: 404, body: { code: 'launcher_unavailable', available: false } }), base: BASE, storage });
    const err = await api.launcherInfo().catch((e) => e);
    expect([err.kind, err.message]).toEqual(['unavailable', 'The launcher is not published yet. Try again soon.']);
    expect(storage.has(SESSION_KEY)).toBe(true);
  });

  test('without a session no request is made', async () => {
    const fetch = fakeFetch();
    const api = createAccountApi({ fetch, base: BASE, storage: fakeStorage() });
    await expect(api.launcherInfo()).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fetch.calls).toHaveLength(0);
  });

  test('logout drops the session', () => {
    const storage = loggedIn();
    createAccountApi({ fetch: fakeFetch(), base: BASE, storage }).logout();
    expect(storage.has(SESSION_KEY)).toBe(false);
  });

  test('the token is never put in a url', async () => {
    const fetch = fakeFetch({ body: {} }, { body: { url: '/api/downloads/launcher/file?t=abc' } });
    const api = createAccountApi({ fetch, base: BASE, storage: loggedIn() });
    await api.launcherInfo();
    await api.launcherDownloadUrl();
    for (const c of fetch.calls) expect(c.url).not.toContain('tok123');
  });
});

describe('formatting and config', () => {
  test('size in MB with one decimal', () => {
    expect(formatSizeMB(6815744)).toBe('6.5 MB');
    expect(formatSizeMB(1024 * 1024)).toBe('1.0 MB');
  });
  test('the API base has a default and no trailing slash', () => {
    expect(apiBase({})).toBe(DEFAULT_API_BASE);
    expect(apiBase(undefined)).toBe(DEFAULT_API_BASE);
    expect(apiBase({ VITE_API_BASE: ' https://api.example.com/// ' })).toBe('https://api.example.com');
  });
});
