// Fails when an HTML page points at a local file (script, stylesheet, image, font) that is not there.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const pages = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.html')) pages.push(p);
  }
};
walk(root);

let missing = 0;
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  for (const m of html.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)) {
    let target = join(root, m[1]);
    if (m[1].endsWith('/')) target = join(target, 'index.html');
    if (!existsSync(target)) {
      console.error(`${page.slice(root.length)}: ${m[1]} does not exist`);
      missing++;
    }
  }
}
console.log(`${pages.length} pages checked, ${missing} missing`);
process.exit(missing ? 1 : 0);
