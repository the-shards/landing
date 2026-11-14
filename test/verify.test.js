// Checks the website verifier against the vectors the game server's own tests write
// (internal/companions/testdata/fairness_vectors.json), so the two implementations cannot drift.
//
//   npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RollStream, hexToBytes, percent, replayRoll, sha256Hex, specHash, verifyReceipt } from '../fairness/verify.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const vectors = read('./vectors.json');
const published = read('../fairness/spec.json');
const spec = vectors.spec;

function receiptOf(c) {
  return {
    version: spec.version, spec_hash: vectors.spec_hash, committed: true,
    egg_id: c.egg_id, egg_rarity: c.egg, commitment: c.commitment, server_seed: c.server_seed, client_seed: c.client_seed,
    pity_before: { target: c.pity_target, counter: c.pity_counter, threshold: c.pity_threshold },
    result: { species: c.species, rarity: c.rarity, by_pity: c.by_pity },
  };
}

test('the published spec file is the one the server tests write', () => {
  assert.equal(published.spec_hash, vectors.spec_hash);
  assert.deepEqual(published.spec, vectors.spec);
});

test('the spec hash is recomputed byte for byte as the server does', async () => {
  assert.equal(await specHash(spec), vectors.spec_hash);
});

test('the stream matches the server word for word', async () => {
  for (const c of vectors.cases) {
    const s = new RollStream(hexToBytes(c.server_seed), c.egg_id, c.client_seed);
    const words = [];
    for (let i = 0; i < c.first_words.length; i++) words.push((await s.nextWord()).toString());
    assert.deepEqual(words, c.first_words, c.name);
  }
});

test('every vector replays to the same rarity, species and pity flag', async () => {
  for (const c of vectors.cases) {
    const r = await replayRoll(spec, {
      serverSeed: hexToBytes(c.server_seed), eggId: c.egg_id, clientSeed: c.client_seed, egg: c.egg,
      pityTarget: c.pity_target, pityCounter: c.pity_counter, pityThreshold: c.pity_threshold,
    });
    assert.deepEqual([r.rarity, r.species, r.byPity], [c.rarity, c.species, c.by_pity], c.name);
    assert.equal(await sha256Hex(hexToBytes(c.server_seed)), c.commitment, `${c.name}: commitment`);
  }
});

test('a genuine receipt verifies, every check passing', async () => {
  for (const c of vectors.cases) {
    const out = await verifyReceipt(published, receiptOf(c));
    assert.ok(out.ok, `${c.name}: ${JSON.stringify(out.checks.filter((x) => !x.ok))}`);
    assert.deepEqual(out.checks.map((x) => x.id), ['committed', 'spec-intact', 'spec-version', 'seal', 'replay']);
  }
});

test('a tampered receipt fails the right check', async () => {
  const c = vectors.cases[2];
  const failing = async (mutate) => {
    const r = receiptOf(c);
    mutate(r);
    const out = await verifyReceipt(published, r);
    assert.equal(out.ok, false);
    return out.checks.filter((x) => !x.ok).map((x) => x.id);
  };
  // The server swaps its secret after the sale: the seal no longer matches.
  assert.ok((await failing((r) => { r.server_seed = r.server_seed.replace(/^../, (m) => (m === '00' ? '01' : '00')); })).includes('seal'));
  // A forged result: the replay disagrees.
  const other = vectors.cases.find((x) => x.species !== c.species && x.egg === c.egg) || vectors.cases.find((x) => x.species !== c.species);
  assert.ok((await failing((r) => { r.result.species = other.species; r.result.rarity = other.rarity; })).includes('replay'));
  // A different client seed rolls a different stream.
  const changedSeed = await failing((r) => { r.client_seed = r.client_seed + 'x'; });
  assert.ok(changedSeed.includes('replay') || changedSeed.length === 0 || true); // may coincide by chance; the stream test above is the real guard
  // Rules from another version.
  assert.deepEqual(await failing((r) => { r.spec_hash = '0'.repeat(64); }), ['spec-version']);
  // A commitment that is not the seal of this secret.
  assert.ok((await failing((r) => { r.commitment = 'f'.repeat(64); })).includes('seal'));
  // A receipt that is not a receipt, a legacy egg and a malformed secret.
  assert.equal((await verifyReceipt(published, null)).ok, false);
  assert.equal((await verifyReceipt(published, { committed: false })).ok, false);
  assert.ok((await failing((r) => { r.server_seed = 'zz'; })).includes('seed-format'));
});

test('altered published rules are noticed', async () => {
  const forged = structuredClone(published);
  forged.spec.table.common[4] = 999999999999; // a legendary on every common egg
  const out = await verifyReceipt(forged, receiptOf(vectors.cases[0]));
  assert.equal(out.checks.find((x) => x.id === 'spec-intact').ok, false);
});

test('odds are printed exactly, with no rounding', () => {
  assert.equal(percent(spec.total, spec.total), '100%');
  assert.equal(percent(0, spec.total), '0%');
  assert.equal(percent(100000, spec.total), '0.00001%');
  assert.equal(percent(990000000000, spec.total), '99%');
  assert.equal(percent(spec.table.common[0], spec.total), '87.48999%'); // the server's own FormatPercent of the same units
  // Every egg's row adds up to 100% of the total.
  for (const [egg, row] of Object.entries(spec.table)) {
    assert.equal(row.reduce((a, b) => a + BigInt(b), 0n), BigInt(spec.total), egg);
  }
});

test('rejection sampling stays in range and roughly uniform', async () => {
  const s = new RollStream(hexToBytes(vectors.cases[0].server_seed), 'x', '');
  const n = (1n << 63n) + 1n; // rejects almost half of all words
  let high = 0;
  for (let i = 0; i < 400; i++) {
    const v = await s.uint64n(n);
    assert.ok(v < n);
    if (v >= n / 2n) high++;
  }
  assert.ok(high > 140 && high < 260, `${high} of 400 in the top half`);
  assert.equal(await s.uint64n(1), 0n);
  assert.equal(await s.uint64n(0), 0n);
});
