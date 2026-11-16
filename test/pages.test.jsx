// The signup, login and download pages, rendered with a fake api (no network).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../src/App.jsx';
import { SessionProvider } from '../src/lib/account/SessionContext.jsx';
import { AccountError, messageFor } from '../src/lib/account/account.js';
import { go } from '../src/lib/account/navigate.js';

vi.mock('../src/lib/account/navigate.js', () => ({ go: vi.fn() }));

const SESSION = { token: 'tok', username: 'ana', player_id: 1 };
const INFO = { available: true, file: 'TheShardsLauncher.exe', version: '0.1.0', size: 6815744, sha256: 'ab'.repeat(32), updated_at: 'x' };
const fail = (context, kind, status = 0, retryAfter = null) => new AccountError(kind, status, messageFor(context, kind, retryAfter), { retryAfter });

function fakeApi({ session: initial = null, ...over } = {}) {
  let session = initial;
  return {
    session: () => session,
    logout: vi.fn(() => { session = null; }),
    inviteRequired: vi.fn(async () => true),
    register: vi.fn(async () => { session = SESSION; return SESSION; }),
    login: vi.fn(async () => { session = SESSION; return SESSION; }),
    launcherInfo: vi.fn(async () => INFO),
    launcherDownloadUrl: vi.fn(async () => 'https://api.test/api/downloads/launcher/file?t=abc'),
    ...over,
  };
}

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

function mount(path, api) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider api={api}><App /><Where /></SessionProvider>
    </MemoryRouter>,
  );
}

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  vi.mocked(go).mockClear();
});
afterEach(cleanup);

describe('signup', () => {
  test('asks the server whether a code is needed, and hides the field when it is not', async () => {
    const api = fakeApi({ inviteRequired: vi.fn(async () => false) });
    mount('/signup', api);
    await waitFor(() => expect(screen.queryByLabelText('Invitation code')).toBeNull());
  });

  test('shows the code field by default (and when the call fails)', () => {
    mount('/signup', fakeApi({ inviteRequired: vi.fn(() => new Promise(() => {})) }));
    expect(screen.getByLabelText('Invitation code')).toBeTruthy();
  });

  test('validates before it asks the server', () => {
    const api = fakeApi();
    mount('/signup', api);
    type('Username', 'guest_1');
    type('Password', 'short');
    type('Confirm password', 'other');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert').textContent).toMatch(/^\[X\]/);
    expect(screen.getAllByText(/^\[X\] /).length).toBeGreaterThanOrEqual(3);
    expect(api.register).not.toHaveBeenCalled();
  });

  test('creates the account, keeps the code as typed and goes to /download', async () => {
    const api = fakeApi();
    mount('/signup', api);
    type('Username', 'ana');
    type('Password', 'longenough');
    type('Confirm password', 'longenough');
    type('Invitation code', 'abcd efgh');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/download'));
    expect(api.register).toHaveBeenCalledWith({ username: 'ana', password: 'longenough', invite: 'abcd efgh' });
  });

  test('a server refusal shows in the alert and the button works again', async () => {
    const api = fakeApi({ register: vi.fn(async () => { throw fail('register', 'invite_required', 403); }) });
    mount('/signup', api);
    type('Username', 'ana');
    type('Password', 'longenough');
    type('Confirm password', 'longenough');
    type('Invitation code', 'nope');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('alert')).textContent).toBe('[X] A valid invitation code is required');
    expect(screen.getByRole('button', { name: 'Create account' }).disabled).toBe(false);
  });

  test('the button is disabled while the request runs', async () => {
    let release;
    const api = fakeApi({ register: vi.fn(() => new Promise((r) => { release = () => r(SESSION); })) });
    mount('/signup', api);
    type('Username', 'ana');
    type('Password', 'longenough');
    type('Confirm password', 'longenough');
    type('Invitation code', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('button', { name: 'Creating...' })).disabled).toBe(true);
    release();
  });

  test('links to the login page', () => {
    mount('/signup', fakeApi());
    expect(screen.getAllByRole('link', { name: 'Log in' }).some((a) => a.getAttribute('href') === '/login')).toBe(true);
  });
});

describe('login', () => {
  const submit = () => {
    type('Username', 'ana');
    type('Password', 'pw');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  };

  test('goes to the next page when it is a same-site path', async () => {
    mount('/login?next=/fairness/', fakeApi());
    submit();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/fairness/'));
  });

  test.each(['//evil.example', 'https://evil.example', '/\\evil', ''])('ignores the unsafe next %j', async (next) => {
    mount(`/login?next=${encodeURIComponent(next)}`, fakeApi());
    submit();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/download'));
  });

  test('shows the server answer: 401, 403, and the lock-out seconds', async () => {
    for (const [kind, status, retry, text] of [
      ['unauthorized', 401, null, '[X] Wrong username or password'],
      ['forbidden', 403, null, '[X] This account cannot sign in'],
      ['rate_limited', 429, 45, '[X] Too many attempts, try again in 45 seconds'],
    ]) {
      const api = fakeApi({ login: vi.fn(async () => { throw fail('login', kind, status, retry); }) });
      mount('/login', api);
      submit();
      expect((await screen.findByRole('alert')).textContent).toBe(text);
      cleanup();
    }
  });

  test('needs both fields', () => {
    const api = fakeApi();
    mount('/login', api);
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();
  });
});

describe('download', () => {
  test('without a session it sends the player to log in, then back', async () => {
    mount('/download', fakeApi());
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login?next=/download'));
  });

  test('shows who is logged in, the version, size and checksum', async () => {
    mount('/download/', fakeApi({ session: SESSION }));
    expect(await screen.findByText('0.1.0')).toBeTruthy();
    expect(screen.getByText('6.5 MB')).toBeTruthy();
    expect(screen.getByText('ab'.repeat(32))).toBeTruthy();
    expect(screen.getByText('ana')).toBeTruthy();
    expect(screen.getByText(/unknown publisher/)).toBeTruthy();
    expect(screen.getByText(/OpenGL 3.3/)).toBeTruthy();
    expect(screen.getByText(/Start menu entry/)).toBeTruthy();
    expect(screen.getByText(/Settings, Apps, The Shards/)).toBeTruthy();
  });

  test('the button asks for a ticket and navigates the browser to it', async () => {
    const api = fakeApi({ session: SESSION });
    mount('/download', api);
    await screen.findByText('0.1.0');
    fireEvent.click(screen.getByRole('button', { name: 'Download for Windows' }));
    await waitFor(() => expect(go).toHaveBeenCalledWith('https://api.test/api/downloads/launcher/file?t=abc'));
    expect(api.launcherDownloadUrl).toHaveBeenCalledTimes(1);
  });

  test('the button is disabled while the ticket is requested', async () => {
    const api = fakeApi({ session: SESSION, launcherDownloadUrl: vi.fn(() => new Promise(() => {})) });
    mount('/download', api);
    await screen.findByText('0.1.0');
    fireEvent.click(screen.getByRole('button', { name: 'Download for Windows' }));
    expect((await screen.findByRole('button', { name: 'Preparing...' })).disabled).toBe(true);
  });

  test('a 401 drops the session and goes to the login page', async () => {
    const api = fakeApi({ session: SESSION, launcherInfo: vi.fn(async () => { throw fail('download', 'unauthorized', 401); }) });
    mount('/download', api);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login?next=/download'));
    expect(api.logout).toHaveBeenCalled();
  });

  test('an unpublished launcher says so and cannot be downloaded', async () => {
    const api = fakeApi({ session: SESSION, launcherInfo: vi.fn(async () => { throw fail('download', 'unavailable', 404); }) });
    mount('/download', api);
    expect((await screen.findByRole('alert')).textContent).toBe('[X] The launcher is not published yet. Try again soon.');
    expect(screen.getByRole('button', { name: 'Download for Windows' }).disabled).toBe(true);
  });

  test('a suspended account is told so and cannot download', async () => {
    const api = fakeApi({ session: SESSION, launcherInfo: vi.fn(async () => { throw fail('download', 'forbidden', 403); }) });
    mount('/download', api);
    expect((await screen.findByRole('alert')).textContent).toBe('[X] This account is suspended. If you think this is a mistake, ask on Discord.');
    expect(screen.getByRole('button', { name: 'Download for Windows' }).disabled).toBe(true);
    expect(document.getElementById('launcher-sha256')).toBeNull();
  });

  test('a ticket refused because the account was suspended meanwhile shows the same message', async () => {
    const api = fakeApi({ session: SESSION, launcherDownloadUrl: vi.fn(async () => { throw fail('download', 'forbidden', 403); }) });
    mount('/download', api);
    await screen.findByText('0.1.0');
    fireEvent.click(screen.getByRole('button', { name: 'Download for Windows' }));
    expect((await screen.findByRole('alert')).textContent).toBe('[X] This account is suspended. If you think this is a mistake, ask on Discord.');
  });

  test('log out clears the session and leaves the page', async () => {
    const api = fakeApi({ session: SESSION });
    mount('/download', api);
    await screen.findByText('0.1.0');
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login?next=/download'));
    expect(api.logout).toHaveBeenCalled();
  });
});

describe('routes', () => {
  test('trailing slashes work and unknown paths get the not-found page', () => {
    mount('/fairness/', fakeApi());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/provably fair/);
    cleanup();
    mount('/nope/at/all', fakeApi());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Nothing here.');
  });
});
