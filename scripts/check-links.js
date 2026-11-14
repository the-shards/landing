// Fails when a page or stylesheet points at a local file (script, stylesheet, image, font) that is not there.
//
// The legal PDFs are the exception: the team uploads them later (see legal/README.md), so a missing
// one is printed as a warning and does not fail the check.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LEGAL_PDF = /^\/legal\/[^/]+\.pdf$/;

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'refactor') continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.html') || entry.name.endsWith('.css')) files.push(p);
  }
};
walk(root);

// Local references in a file: src="/x", href="/x" in HTML, url(/x) in CSS.
export function localReferences(text, isHtml) {
  const refs = [];
  const patterns = isHtml ? [/(?:src|href)="(\/[^"#?]*)"/g] : [/url\(\s*['"]?(\/[^'")#?]*)/g];
  for (const re of patterns) for (const m of text.matchAll(re)) refs.push(m[1]);
  return refs;
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  let missing = 0;
  let waiting = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const ref of localReferences(text, file.endsWith('.html'))) {
      let target = join(root, ref);
      if (ref.endsWith('/')) target = join(target, 'index.html');
      if (existsSync(target)) continue;
      if (LEGAL_PDF.test(ref)) {
        console.warn(`warning: ${ref} is not uploaded yet (${file.slice(root.length)})`);
        waiting++;
      } else {
        console.error(`${file.slice(root.length)}: ${ref} does not exist`);
        missing++;
      }
    }
  }
  console.log(`${files.length} files checked, ${missing} missing, ${waiting} legal PDF(s) not uploaded yet`);
  process.exit(missing ? 1 : 0);
}
