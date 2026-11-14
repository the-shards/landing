// The design rules from the landing brief, enforced. The pixel fonts only have plain ASCII and look wrong
// at fractional sizes, and the palette and hard-edged style are deliberate, so these fail loudly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeLauncher, patchHtml } from '../scripts/sync-launcher.js';
import { localReferences } from '../scripts/check-links.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pages = { 'index.html': read('index.html'), 'fairness/index.html': read('fairness/index.html') };
const css = read('assets/shards.css');

// What a reader sees: the text nodes plus the attributes that are shown or spoken.
function visibleText(html) {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]*>/g, ' ');
  const attrs = [...html.matchAll(/\s(?:alt|placeholder|aria-label|title|content)="([^"]*)"/g)].map((m) => m[1]);
  return `${body} ${attrs.join(' ')}`;
}

test('every character a reader sees exists in the pixel fonts (ASCII 32 to 126)', () => {
  for (const [name, html] of Object.entries(pages)) {
    const bad = [...new Set([...visibleText(html)].filter((c) => !/[\x20-\x7e\s]/.test(c)))];
    assert.deepEqual(bad, [], `${name} has characters the fonts do not have: ${bad.join(' ')}`);
    assert.ok(!/&(middot|copy|mdash|ndash|hellip|[lr][sd]quo|nbsp);|&#\d+;/.test(html), `${name} uses a character entity the fonts lack`);
  }
});

test('the scripts only produce ASCII text as well', () => {
  for (const file of ['fairness/page.js', 'fairness/verify.js']) {
    const bad = [...new Set([...read(file)].filter((c) => !/[\x20-\x7e\s]/.test(c)))];
    assert.deepEqual(bad, [], `${file} has non-ASCII characters: ${bad.join(' ')}`);
  }
});

test('pixel font sizes are whole multiples of 10 px (the fonts are built on a 10px em) and never scaled', () => {
  const sizes = [...css.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1].trim());
  assert.ok(sizes.length > 0);
  for (const s of sizes) assert.match(s, /^([2-8])0px$/, `font-size: ${s}`);
  assert.ok(!/\b(rem|clamp|vw|vh)\b|[0-9]em\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'no rem/em/clamp/viewport units');
});

test('flat, hard-edged style: no gradients, blur, rounded corners, bold or italic', () => {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const banned of ['gradient', 'blur', 'border-radius', 'filter:', 'animation', 'transition', 'italic']) {
    assert.ok(!code.includes(banned), `the stylesheet uses ${banned}`);
  }
  for (const m of code.matchAll(/font-weight:\s*([^;}]+)/g)) assert.equal(m[1].trim(), 'normal');
  // Titles are bold through a crisp duplicate of the glyphs a few pixels to the right (the fonts have no bold weight,
  // and a browser-made bold would smear the pixels): a hard offset, never a blur.
  for (const m of code.matchAll(/text-shadow:\s*([^;}]+)/g)) assert.match(m[1].trim(), /^[1-3]px 0 0 currentColor$/, 'bold is a hard horizontal offset');
  for (const m of code.matchAll(/box-shadow:\s*([^;}]+)/g)) assert.match(m[1].trim(), /^\d+px \d+px 0 (#[0-9a-f]{6}|var\(--[a-z-]+\))$/, 'shadows are hard offsets');
  for (const [name, html] of Object.entries(pages)) {
    assert.ok(!/<(b|strong|i|em)[\s>]/.test(html), `${name}: the fonts have no bold or italic`);
    assert.ok(!/\sstyle="/.test(html), `${name}: styling belongs in shards.css`);
  }
});

test('the palette is the approved one', () => {
  const allowed = new Set(['#161826', '#1e2033', '#373946', '#e9e9ed', '#cfd3e5', '#a3a7c0', '#c1bde9', '#9184d9', '#3ddc84', '#1f7a4a', '#0d0e18', '#ff7a8a', '#6be3a0', '#ffffff']);
  const used = [...css.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase());
  const odd = [...new Set(used.filter((c) => !allowed.has(c)))];
  assert.deepEqual(odd, [], `colours outside the palette: ${odd.join(' ')}`);
});

test('structure: one h1, a skip link first, labelled sections, unique ids', () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.match(html, /<html lang="en">/, name);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${name}: exactly one h1`);
    const firstLink = html.match(/<body>\s*<a class="skip" href="#([^"]+)"/);
    assert.ok(firstLink, `${name}: the skip link is the first thing in the body`);
    assert.ok(html.includes(`id="${firstLink[1]}"`), `${name}: the skip link target exists`);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${name}: duplicate ids`);
    for (const m of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.includes(m[1]), `${name}: aria-labelledby="${m[1]}" has no target`);
    for (const m of html.matchAll(/<img\b[^>]*>/g)) assert.match(m[0], /\balt="/, `${name}: an image has no alt`);
  }
});

test('the page keeps every section and the links the brief names', () => {
  const home = pages['index.html'];
  for (const id of ['top', 'playtest', 'download', 'legal']) assert.ok(home.includes(`id="${id}"`), `#${id}`);
  assert.ok(home.includes('href="/fairness/"'), 'the fair rolls link');
  assert.match(home, /Made by gamers for gamers/);
  assert.match(pages['fairness/index.html'], /Made by gamers for gamers/);
  assert.ok(pages['fairness/index.html'].includes('id="odds-table"') && pages['fairness/index.html'].includes('id="verify-btn"'), 'the odds table and the verifier are still there');
});

test('no third-party requests: the only outside addresses are the form, the API and the vectors on GitHub', () => {
  const allowed = new Set(['forms.gle', 'api.sandbox.theshardsgame.com', 'github.com', 'theshardsgame.com']);
  for (const [name, html] of Object.entries(pages)) {
    assert.ok(!/<script[^>]*\ssrc="https?:/.test(html), `${name}: no external scripts`);
    assert.ok(!/<link[^>]*href="https?:\/\/(?!theshardsgame\.com)/.test(html.replace(/<!--[\s\S]*?-->/g, '')), `${name}: no external stylesheets or fonts`);
    for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/(?:href|src|content)="(https?:\/\/[^"/]+)/g)) {
      assert.ok(allowed.has(new URL(m[1]).hostname), `${name}: ${m[1]} is not an allowed address`);
    }
  }
  assert.ok(!/https?:\/\//.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'the stylesheet makes no outside requests');
});

test('the download card points at the launcher on the API and shows a real checksum', () => {
  const home = pages['index.html'];
  const link = home.match(/data-launcher="link"[^>]*href="([^"]+)"/)[1];
  assert.match(link, /^https:\/\/[a-z.]+\/releases\/files\/TheShardsLauncher\.exe$/);
  assert.match(home.match(/data-launcher="sha256">([^<]*)</)[1], /^[0-9a-f]{64}$/, 'run scripts/sync-launcher.js');
  assert.match(home.match(/data-launcher="version">([^<]*)</)[1], /^\d+\.\d+\.\d+$/);
  assert.match(home.match(/data-launcher="size">([^<]*)</)[1], /^\d+\.\d$/);
  assert.equal([...home.matchAll(/class="card-title">(Windows|macOS|Linux)</g)].length, 1, 'only a Windows card');
});

test('sync-launcher describes and patches the card', () => {
  const info = describeLauncher({ manifestVersion: '0.2.0+abc1234', bytes: 6_815_744, sha256: 'a'.repeat(64), api: 'https://api.example.com/' });
  assert.deepEqual(info, { version: '0.2.0', size: '6.5', sha256: 'a'.repeat(64), link: 'https://api.example.com/releases/files/TheShardsLauncher.exe' });
  const out = patchHtml(pages['index.html'], info);
  assert.ok(out.includes('data-launcher="version">0.2.0<') && out.includes('href="https://api.example.com/releases/files/TheShardsLauncher.exe"'));
  assert.throws(() => patchHtml('<p>nothing</p>', info), /data-launcher/);
  assert.throws(() => describeLauncher({ manifestVersion: 'x y', bytes: 1, sha256: 'a'.repeat(64), api: 'https://a' }), /version/);
  assert.throws(() => describeLauncher({ manifestVersion: '1.0.0', bytes: 1, sha256: 'nope', api: 'https://a' }), /checksum/);
});

test('local references: pages, stylesheet and fonts', () => {
  assert.deepEqual(localReferences('<a href="/x/">k</a><img src="/a.png"><a href="#top">', true), ['/x/', '/a.png']);
  assert.deepEqual(localReferences("src: url(/assets/f.woff2) format('woff2'), url('/assets/f.ttf');", false), ['/assets/f.woff2', '/assets/f.ttf']);
});
