// Fills the download card in index.html with the launcher that is really published.
//
//   node scripts/sync-launcher.js [API base URL]
//
// It reads <api>/releases/manifest.json for the version, downloads <api>/releases/files/TheShardsLauncher.exe
// to measure its size and SHA-256, and rewrites the spans marked data-launcher="version|size|sha256" and the
// link marked data-launcher="link" in index.html. The default API is the sandbox; pass another address to point
// the site at it. Run it when the launcher changes (the launcher rarely does: it updates the game itself),
// then review and commit the diff.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DEFAULT_API = 'https://api.sandbox.theshardsgame.com';

// What the card shows: the version without the build suffix ("0.1.0+d9b52d4" -> "0.1.0"), the size in MB with one decimal.
export function describeLauncher({ manifestVersion, bytes, sha256, api }) {
  const version = String(manifestVersion).split('+')[0];
  if (!/^[0-9A-Za-z.-]{1,32}$/.test(version)) throw new Error(`unexpected launcher version "${manifestVersion}"`);
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('unexpected checksum');
  return {
    version,
    size: (bytes / (1024 * 1024)).toFixed(1),
    sha256,
    link: `${api.replace(/\/+$/, '')}/releases/files/TheShardsLauncher.exe`,
  };
}

// Rewrites the marked spans and the marked link; throws if a marker is missing so a template change cannot go unnoticed.
export function patchHtml(html, info) {
  let out = html;
  for (const key of ['version', 'size', 'sha256']) {
    const re = new RegExp(`(<span data-launcher="${key}">)[^<]*(</span>)`);
    if (!re.test(out)) throw new Error(`index.html has no data-launcher="${key}" span`);
    out = out.replace(re, `$1${info[key]}$2`);
  }
  const link = /(<a [^>]*data-launcher="link"[^>]*href=")[^"]*(")/;
  if (!link.test(out)) throw new Error('index.html has no data-launcher="link" anchor');
  return out.replace(link, `$1${info.link}$2`);
}

async function main() {
  const api = (process.argv[2] || DEFAULT_API).replace(/\/+$/, '');
  const get = async (path) => {
    const res = await fetch(`${api}${path}`);
    if (!res.ok) throw new Error(`${api}${path}: HTTP ${res.status}`);
    return res;
  };
  const manifest = await (await get('/releases/manifest.json')).json();
  const bytes = Buffer.from(await (await get('/releases/files/TheShardsLauncher.exe')).arrayBuffer());
  const info = describeLauncher({
    manifestVersion: manifest.version,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    api,
  });
  const path = new URL('../index.html', import.meta.url);
  writeFileSync(path, patchHtml(readFileSync(path, 'utf8'), info));
  console.log(`launcher v${info.version}, ${info.size} MB, sha256 ${info.sha256}\n${info.link}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
