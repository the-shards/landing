// @vitest-environment node
// Drives the api module against a tiny HTTP server that behaves like the contract (registration, register, login,
// launcher info, ticket, file). It proves the requests the site really sends; the real API is checked separately.
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { SESSION_KEY, createAccountApi } from '../src/lib/account/account.js';

const INFO = { available: true, file: 'TheShardsLauncher.exe', version: '0.1.0', size: 6815744, sha256: 'c'.repeat(64), updated_at: '2026-11-14T00:00:00Z' };
const state = { launcher: true, mode: 'invite', logins: 0, log: [] };
let server;
let base;

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const bearerOk = (req) => req.headers.authorization === 'Bearer good-token';

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    state.log.push(`${req.method} ${url.pathname}`);
    if (req.method === 'GET' && url.pathname === '/api/auth/registration') {
      return send(res, 200, { mode: state.mode, invite_required: state.mode === 'invite' });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const body = await readJson(req);
      if (body.username === 'busy') return send(res, 429, { error: 'slow down' });
      if (body.invite_code !== 'GOOD-CODE') return send(res, 403, { error: 'invitation required', code: 'invite_required' });
      if (body.username === 'taken') return send(res, 409, { error: 'username taken' });
      return send(res, 201, { player_id: 9, token: 'good-token', username: body.username, is_admin: false });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJson(req);
      if (body.username === 'banned') return send(res, 403, { error: 'banned' });
      if (body.username === 'locked') return send(res, 429, { error: 'locked' }, { 'Retry-After': '90' });
      if (body.password !== 'right-password') return send(res, 401, { error: 'wrong credentials' });
      return send(res, 200, { player_id: 9, token: 'good-token', username: body.username, is_admin: false });
    }
    if (url.pathname.startsWith('/api/downloads/')) {
      if (!bearerOk(req) && url.pathname !== '/api/downloads/launcher/file') return send(res, 401, { error: 'unauthorized' });
      if (url.pathname === '/api/downloads/launcher/info' && req.method === 'GET') {
        return state.launcher ? send(res, 200, INFO) : send(res, 404, { code: 'launcher_unavailable', available: false });
      }
      if (url.pathname === '/api/downloads/launcher/ticket' && req.method === 'POST') {
        return send(res, 200, { url: '/api/downloads/launcher/file?t=ticket-1', expires_in: 120 });
      }
      if (url.pathname === '/api/downloads/launcher/file') {
        if (url.searchParams.get('t') !== 'ticket-1') return send(res, 401, { error: 'bad ticket' });
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        return res.end('MZ-fake-launcher');
      }
    }
    return send(res, 404, { error: 'not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), has: (k) => m.has(k) };
}

describe('the account module against a server that follows the contract', () => {
  test('signup, then info, then ticket, then the file the browser would fetch', async () => {
    const storage = memoryStorage();
    const api = createAccountApi({ base, storage });
    expect(await api.inviteRequired()).toBe(true);
    const session = await api.register({ username: 'newbie', password: 'longenough', invite: 'GOOD-CODE' });
    expect(session).toEqual({ token: 'good-token', username: 'newbie', player_id: 9 });
    expect(await api.launcherInfo()).toEqual(INFO);
    const url = await api.launcherDownloadUrl();
    expect(url).toBe(`${base}/api/downloads/launcher/file?t=ticket-1`);
    const file = await fetch(url);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe('MZ-fake-launcher');
  });

  test('open registration is detected', async () => {
    state.mode = 'open';
    try {
      expect(await createAccountApi({ base, storage: memoryStorage() }).inviteRequired()).toBe(false);
    } finally {
      state.mode = 'invite';
    }
  });

  test('register: 403 invite_required, 409, 429', async () => {
    const api = createAccountApi({ base, storage: memoryStorage() });
    const attempt = (username, invite) => api.register({ username, password: 'longenough', invite }).catch((e) => e);
    expect(await attempt('ana', 'WRONG')).toMatchObject({ kind: 'invite_required', status: 403, message: 'A valid invitation code is required' });
    expect(await attempt('taken', 'GOOD-CODE')).toMatchObject({ kind: 'conflict', status: 409, message: 'That username is taken' });
    expect(await attempt('busy', 'GOOD-CODE')).toMatchObject({ kind: 'rate_limited', status: 429, message: 'Too many attempts, wait a moment and try again' });
  });

  test('login: 200, 401, 403, 429 with Retry-After', async () => {
    const storage = memoryStorage();
    const api = createAccountApi({ base, storage });
    const attempt = (username, password) => api.login({ username, password }).catch((e) => e);
    expect(await attempt('wrong', 'nope')).toMatchObject({ kind: 'unauthorized', message: 'Wrong username or password' });
    expect(await attempt('banned', 'right-password')).toMatchObject({ kind: 'forbidden', message: 'This account cannot sign in' });
    expect(await attempt('locked', 'right-password')).toMatchObject({ kind: 'rate_limited', retryAfter: 90, message: 'Too many attempts, try again in 90 seconds' });
    expect(storage.has(SESSION_KEY)).toBe(false);
    expect(await attempt('ana', 'right-password')).toMatchObject({ username: 'ana', token: 'good-token' });
    expect(storage.has(SESSION_KEY)).toBe(true);
  });

  test('a token the server rejects clears the session', async () => {
    const storage = memoryStorage();
    storage.setItem(SESSION_KEY, JSON.stringify({ token: 'stale', username: 'ana', player_id: 9 }));
    const err = await createAccountApi({ base, storage }).launcherInfo().catch((e) => e);
    expect(err.kind).toBe('unauthorized');
    expect(storage.has(SESSION_KEY)).toBe(false);
  });

  test('an unpublished launcher is a clear answer, not a failure of the session', async () => {
    const storage = memoryStorage();
    const api = createAccountApi({ base, storage });
    await api.login({ username: 'ana', password: 'right-password' });
    state.launcher = false;
    try {
      const err = await api.launcherInfo().catch((e) => e);
      expect(err).toMatchObject({ kind: 'unavailable', message: 'The launcher is not published yet. Try again soon.' });
      expect(storage.has(SESSION_KEY)).toBe(true);
    } finally {
      state.launcher = true;
    }
  });

  test('an unreachable server', async () => {
    const dead = createAccountApi({ base: 'http://127.0.0.1:1', storage: memoryStorage() });
    expect(await dead.login({ username: 'a', password: 'b' }).catch((e) => e)).toMatchObject({ kind: 'network', message: 'Cannot reach the server' });
  });
});
