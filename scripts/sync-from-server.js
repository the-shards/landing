// Copies the published fair-roll rules from the game server's test vectors into this site.
//
//   node scripts/sync-from-server.js ../server/internal/companions/testdata/fairness_vectors.json
//
// Run it whenever the server's FairnessVersion changes, then `npm test`. It writes
// fairness/spec.json (what the page shows and the verifier checks receipts against) and
// test/vectors.json (what the verifier is tested against).
import { readFileSync, writeFileSync } from 'node:fs';

const from = process.argv[2];
if (!from) {
  console.error('usage: node scripts/sync-from-server.js <path to fairness_vectors.json>');
  process.exit(2);
}
const vectors = JSON.parse(readFileSync(from, 'utf8'));
const published = { version: vectors.spec.version, spec_hash: vectors.spec_hash, spec: vectors.spec };
const write = (path, value) => writeFileSync(new URL(`../${path}`, import.meta.url), JSON.stringify(value, null, 2) + '\n');
write('fairness/spec.json', published);
write('test/vectors.json', vectors);
console.log(`synced rules version ${published.version}, fingerprint ${published.spec_hash.slice(0, 16)}...`);
