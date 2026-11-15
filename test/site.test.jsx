// The design rules from the landing brief, enforced. The pixel fonts only have plain ASCII and look wrong at fractional
// sizes, and the palette and hard-edged style are deliberate, so these fail loudly. Each route is rendered and checked,
// and the production build is made once to check the Content-Security-Policy and that no inline code sneaks in.
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { build } from 'vite';
import App from '../src/App.jsx';
import { SessionProvider } from '../src/lib/account/SessionContext.jsx';
import { API_BASE, DEFAULT_API_BASE } from '../src/config.js';
import { buildCsp } from '../csp.js';

const rootDir = process.cwd(); // vitest runs from the repo root
const at = (path) => join(rootDir, path);
const read = (path) => readFileSync(at(path), 'utf8');
const css = read('src/styles/shards.css');
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const srcDir = at('src');
const sourceFiles = walk(srcDir).filter((f) => /\.(js|jsx)$/.test(f));
const asciiOnly = (text) => [...new Set([...text].filter((c) => !/[\x20-\x7e\s]/.test(c)))];

// A signed-in fake so /download renders its page instead of redirecting.
const api = { session: () => ({ token: 't', username: 'ana', player_id: 1 }), logout() {}, inviteRequired: async () => true };
const ROUTES = ['/', '/fairness', '/fairness/', '/signup', '/login', '/download', '/nowhere'];
const pages = {};
const quiet = vi.spyOn(console, 'error').mockImplementation(() => {}); // react warns about layout effects when rendering to a string
for (const route of ROUTES) {
  pages[route] = renderToStaticMarkup(
    <MemoryRouter initialEntries={[route]}><SessionProvider api={api}><App /></SessionProvider></MemoryRouter>,
  );
}

quiet.mockRestore();

// What a reader sees: the text nodes plus the attributes that are shown or spoken.
function visibleText(html) {
  const body = html.replace(/<[^>]*>/g, ' ');
  const attrs = [...html.matchAll(/\s(?:alt|placeholder|aria-label|title|content)="([^"]*)"/g)].map((m) => m[1]);
  return `${body} ${attrs.join(' ')}`;
}

describe('plain ASCII only (the pixel fonts have nothing else)', () => {
  test('the source files and index.html', () => {
    for (const file of [...sourceFiles, at('index.html')]) {
      expect(asciiOnly(readFileSync(file, 'utf8')), `${file} has characters the fonts do not have`).toEqual([]);
    }
  });

  test('everything a reader sees on every route', () => {
    for (const [route, html] of Object.entries(pages)) {
      expect(asciiOnly(visibleText(html).replace(/&(amp|lt|gt|quot|#x27);/g, ' ')), `${route} has characters the fonts lack`).toEqual([]);
      expect(html, `${route} uses a character entity the fonts lack`).not.toMatch(/&(middot|copy|mdash|ndash|hellip|[lr][sd]quo|nbsp);|&#(?!x27;)\d+;/);
    }
  });
});

describe('the stylesheet', () => {
  test('pixel font sizes are whole multiples of 10 px and never scaled', () => {
    const sizes = [...cssCode.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1].trim());
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toMatch(/^([2-8])0px$/);
    expect(cssCode).not.toMatch(/\b(rem|clamp|vw|vh)\b|[0-9]em\b/);
  });

  test('flat and hard-edged: no gradients, blur, rounded corners, animation, bold or italic', () => {
    for (const banned of ['gradient', 'blur', 'border-radius', 'filter:', 'animation', 'transition', 'italic']) {
      expect(cssCode.includes(banned), `the stylesheet uses ${banned}`).toBe(false);
    }
    for (const m of cssCode.matchAll(/font-weight:\s*([^;}]+)/g)) expect(m[1].trim()).toBe('normal');
    // Bold is a crisp duplicate of the glyphs a few pixels to the right: a hard offset, never a blur.
    for (const m of cssCode.matchAll(/text-shadow:\s*([^;}]+)/g)) expect(m[1].trim()).toMatch(/^[1-3]px 0 0 currentColor$/);
    for (const m of cssCode.matchAll(/box-shadow:\s*([^;}]+)/g)) expect(m[1].trim()).toMatch(/^\d+px \d+px 0 (#[0-9a-f]{6}|var\(--[a-z-]+\))$/);
  });

  test('the palette is the approved one', () => {
    const allowed = new Set(['#161826', '#1e2033', '#373946', '#e9e9ed', '#cfd3e5', '#a3a7c0', '#c1bde9', '#9184d9', '#3ddc84', '#1f7a4a', '#0d0e18', '#ff7a8a', '#6be3a0', '#ffffff']);
    const odd = [...new Set([...css.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()).filter((c) => !allowed.has(c)))];
    expect(odd).toEqual([]);
  });

  test('form controls use the pixel font at 20px and touch targets of 44px or more', () => {
    const input = cssCode.match(/\.input\s*\{[^}]*\}/)[0];
    expect(input).toMatch(/font-size:\s*20px/);
    expect(input).toMatch(/border:\s*4px solid/);
    expect(Number(input.match(/min-height:\s*(\d+)px/)[1])).toBeGreaterThanOrEqual(44);
  });

  test('the stylesheet makes no outside requests, and every font and image it names exists', () => {
    expect(cssCode).not.toMatch(/https?:\/\//);
    for (const m of cssCode.matchAll(/url\(\s*['"]?(\/[^'")#?]*)/g)) expect(existsSync(at(`public${m[1]}`)), m[1]).toBe(true);
  });
});

describe('the code', () => {
  test('no style props and no raw HTML injection', () => {
    for (const file of sourceFiles.filter((f) => f.endsWith('.jsx'))) {
      const text = readFileSync(file, 'utf8');
      expect(text, `${file} has a style prop`).not.toMatch(/\bstyle=\{/);
      expect(text, `${file} injects raw HTML`).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  test('no third-party addresses: only the form, Discord, GitHub and the API', () => {
    const allowed = new Set(['forms.gle', 'discord.gg', 'github.com', 'theshardsgame.com', new URL(DEFAULT_API_BASE).hostname]);
    for (const file of [...sourceFiles, at('index.html')]) {
      for (const m of readFileSync(file, 'utf8').matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        expect(allowed.has(m[1].toLowerCase()), `${file}: ${m[0]} is not an allowed address`).toBe(true);
      }
    }
  });

  test('every local image and font a route or index.html uses is in public/', () => {
    const html = Object.values(pages).join('\n') + read('index.html');
    for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) expect(existsSync(at(`public${m[1]}`)), m[1]).toBe(true);
  });
});

describe('every route', () => {
  test.each(ROUTES)('%s: one h1, a skip link first, a main, labelled sections, unique ids, alt text', (route) => {
    const html = pages[route];
    expect(html.match(/<h1[\s>]/g) || []).toHaveLength(1);
    expect(html).toMatch(/^<a class="skip" href="#main">/);
    expect(html).toContain('<main id="main"');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size, `duplicate ids on ${route}`).toBe(ids.length);
    for (const m of html.matchAll(/aria-labelledby="([^"]+)"/g)) expect(ids, `aria-labelledby="${m[1]}" has no target`).toContain(m[1]);
    for (const m of html.matchAll(/<img\b[^>]*>/g)) expect(m[0]).toMatch(/\balt="/);
    for (const m of html.matchAll(/<label[^>]*for="([^"]+)"/g)) expect(ids, `label for="${m[1]}"`).toContain(m[1]);
    expect(html).not.toMatch(/<(b|strong|i|em)[\s>]/);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/<script/);
    const left = [...visibleText(html).matchAll(/\[[A-Z][A-Z0-9 ]{2,}\]/g)].map((m) => m[0]);
    expect(left, 'a placeholder is left on the page').toEqual([]);
    expect(html).not.toMatch(/href="#"/);
  });

  test('the footer slogan and the nav links are everywhere', () => {
    for (const html of Object.values(pages)) {
      expect(html).toContain('Made by gamers for gamers');
      for (const href of ['/fairness', '/download', '/login', '/signup']) expect(html).toContain(`href="${href}"`);
    }
  });

  test('the form pages have the fields the brief asks for', () => {
    expect(pages['/signup']).toMatch(/id="username"[\s\S]*id="password"[\s\S]*id="confirm"[\s\S]*id="invite"/);
    expect(pages['/signup']).toContain('type="password"');
    expect(pages['/login']).toMatch(/id="username"[\s\S]*id="password"/);
    expect(pages['/login']).not.toContain('id="invite"');
  });
});

describe('the home route', () => {
  const home = pages['/'];

  test('keeps its sections, dates and copy', () => {
    for (const id of ['playtest', 'download', 'legal']) expect(home).toContain(`id="${id}"`);
    expect(home).toContain('March 10 to April 1, 2027');
    expect(home).toContain('https://discord.gg/fsArCAUU5');
    expect(home).toContain('Windows 10 or 11, 64-bit');
    expect((home.match(/Coming soon/g) || [])).toHaveLength(3);
  });

  test('sends players to log in or sign up, and never links to the launcher file', () => {
    expect(home).toContain('Log in to download the launcher. New here? Create an account with your invitation code.');
    expect(home).toMatch(/href="\/login"[^>]*>Log in</);
    expect(home).toMatch(/href="\/signup"[^>]*>Create account</);
    expect(home).toMatch(/href="\/download"[^>]*>Get the launcher</);
    expect(home).not.toMatch(/TheShardsLauncher|\/releases\/files|launcher\/file|download="/);
    expect([...home.matchAll(/class="card-title">(Windows|macOS|Linux)</g)]).toHaveLength(1);
  });
});

describe('the production build', () => {
  let out;
  let html;
  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'shards-dist-'));
    await build({ root: rootDir, logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
    html = readFileSync(join(out, 'index.html'), 'utf8');
  }, 60000);
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  test('carries the CSP meta, and its connect-src names the API host', () => {
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1].replaceAll('&#39;', "'"); // the attribute is HTML-escaped
    expect(csp).toBe(buildCsp(new URL(API_BASE).origin));
    const connect = csp.match(/connect-src ([^;]+)/)[1].split(' ');
    expect(connect).toEqual(["'self'", new URL(API_BASE).origin]);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toMatch(/unsafe-/);
    expect(buildCsp('https://x.example', { headers: true })).toContain("frame-ancestors 'none'");
  });

  test('emits only module scripts and a stylesheet link: no inline script or style', () => {
    expect(html).not.toMatch(/<style/);
    expect(html).not.toMatch(/\sstyle="/);
    for (const m of html.matchAll(/<script\b([^>]*)>/g)) expect(m[1]).toMatch(/type="module"[^>]*src="\/static\/[^"]+\.js"|src="\/static\/[^"]+\.js"[^>]*type="module"/);
    expect(html).toMatch(/<link rel="stylesheet"[^>]*href="\/static\/[^"]+\.css"/);
    expect(html).not.toMatch(/(?:src|href)="https?:\/\/(?!theshardsgame\.com)/);
  });

  test('copies the fonts and logo from public/, and bundles no secrets or inline API addresses beyond the base', () => {
    for (const f of ['assets/fonts/Pixelwick.woff2', 'assets/fonts/PixelwickShardCrack.woff2', 'assets/logo.png', 'assets/favicon-32.png']) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
    const js = walk(join(out, 'static')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(js).toContain(API_BASE);
  });
});

describe('deployment files', () => {
  const workflows = readdirSync(at('.github/workflows'));

  test('every workflow action is pinned to a full commit SHA', () => {
    expect(workflows).toEqual(expect.arrayContaining(['test.yml', 'deploy.yml']));
    for (const w of workflows) {
      for (const m of read(`.github/workflows/${w}`).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)) {
        expect(m[1], `${w}: ${m[1]}`).toMatch(/@[0-9a-f]{40}$/);
      }
    }
  });

  test('deploy: sandbox branch, OIDC, environment sandbox, hashed assets cached long, index.html not', () => {
    const deploy = read('.github/workflows/deploy.yml');
    expect(deploy).toMatch(/branches:\s*\[sandbox\]/);
    expect(deploy).toMatch(/id-token:\s*write/);
    expect(deploy).toMatch(/environment:\s*sandbox/);
    expect(deploy).toContain('--delete');
    expect(deploy).toContain('immutable');
    expect(deploy).toMatch(/index\.html[\s\S]*no-cache/);
    expect(deploy).toContain('create-invalidation');
    for (const name of ['AWS_ROLE_ARN', 'AWS_REGION', 'S3_BUCKET', 'CLOUDFRONT_DISTRIBUTION_ID', 'VITE_API_BASE']) expect(deploy).toContain(name);
  });

  test('the env example files hold placeholders only, and real env files are ignored', () => {
    for (const f of ['.env.secret.sandbox.example', '.env.var.sandbox.example']) {
      expect(read(f)).not.toMatch(/arn:aws:iam::\d{12}/);
    }
    const ignore = read('.gitignore');
    for (const line of ['.env.secret.*', '.env.var.*', '.env.sandbox', '.env.production', '!.env.secret.*.example', '!.env.var.*.example']) {
      expect(ignore.split(/\r?\n/)).toContain(line);
    }
  });

  test('README-deploy documents the headers policy', () => {
    const doc = read('README-deploy.md');
    for (const h of ["frame-ancestors 'none'", 'X-Content-Type-Options', 'nosniff', 'Referrer-Policy', 'Strict-Transport-Security', 'X-Frame-Options', 'DENY']) expect(doc).toContain(h);
    expect(doc).toContain(buildCsp(new URL(DEFAULT_API_BASE).origin, { headers: true }));
    expect(doc).toMatch(/nothing here was deployed/i);
  });
});
