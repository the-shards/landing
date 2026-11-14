// The Shards: fair-roll verifier.
//
// Re-runs a hatch from a roll receipt using only public data: the published rules (spec.json)
// and the receipt. It is a faithful port of internal/companions/fairness.go in the game server;
// test/vectors.json (written by the server's tests) pins the two together, and `npm test` checks
// this file against it.
//
// The scheme, in short:
//   commitment = SHA-256(server_seed)                         shown on the egg when it is bought
//   block(i)   = HMAC-SHA256(server_seed, "shards-roll-v1|" + egg_id + "|" + client_seed + "|" + i)
//   words      = the consecutive 8-byte big-endian numbers of block(0) || block(1) || ...
//   Uint64n(n) = next word w; skip it if w >= 2^64 - (2^64 mod n), else w mod n
//   hatch      = pity target if pity_counter + 1 >= pity_threshold, else
//                tier from Uint64n(total) against table[egg], species from Uint64n(len(species[tier]))
//   stats      = after the species, for each name in stat_names: low + Uint64n(high - low + 1) with
//                [low, high] = stat_range[rarity] (just low when high <= low)
// The first client seed the game receives for an egg is locked on it. Affinity and personality are
// rolled privately and are not part of the stream.

const STREAM_LABEL = 'shards-roll-v1';
const TWO64 = 1n << 64n;

const enc = new TextEncoder();

export function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('not a hex string');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(bytes) {
  return bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)));
}

async function hmacSha256(keyBytes, message) {
  const key = await globalThis.crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** The deterministic stream a roll is drawn from. */
export class RollStream {
  constructor(serverSeed, eggId, clientSeed) {
    this.seed = serverSeed;
    this.eggId = eggId;
    this.clientSeed = clientSeed;
    this.block = 0;
    this.buf = new Uint8Array(0);
    this.pos = 0;
  }

  async nextWord() {
    if (this.pos + 8 > this.buf.length) {
      this.buf = await hmacSha256(this.seed, `${STREAM_LABEL}|${this.eggId}|${this.clientSeed}|${this.block}`);
      this.block += 1;
      this.pos = 0;
    }
    const w = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8).getBigUint64(0, false);
    this.pos += 8;
    return w;
  }

  async uint64n(n) {
    n = BigInt(n);
    if (n <= 1n) return 0n;
    const limit = TWO64 - (TWO64 % n);
    for (;;) {
      const w = await this.nextWord();
      if (w < limit) return w % n;
    }
  }
}

/** The four stats the stream gives after the species, in the spec's order. */
async function replayStats(spec, stream, rarity) {
  const [lo, hi] = spec.stat_range[rarity];
  const stats = {};
  for (const name of spec.stat_names) {
    stats[name] = hi <= lo ? lo : lo + Number(await stream.uint64n(hi - lo + 1));
  }
  return stats;
}

/** Which species and stats a hatch gives, given the published rules and the receipt's inputs. */
export async function replayRoll(spec, input) {
  const { serverSeed, eggId, clientSeed, egg, pityTarget, pityCounter, pityThreshold } = input;
  const tierOfSpecies = (id) => spec.tiers.find((t) => (spec.species[t] || []).includes(id));
  const stream = new RollStream(serverSeed, eggId, clientSeed);
  if (pityTarget && tierOfSpecies(pityTarget) === egg && pityCounter + 1 >= pityThreshold) {
    // The pity pick decides the species without drawing; the stats still come from the stream.
    return { rarity: egg, species: pityTarget, byPity: true, stats: await replayStats(spec, stream, egg) };
  }
  const row = spec.table[egg];
  if (!row) throw new Error(`unknown egg rarity "${egg}"`);
  const pick = await stream.uint64n(spec.total);
  let acc = 0n;
  let rarity = egg;
  for (let i = 0; i < spec.tiers.length; i++) {
    acc += BigInt(row[i]);
    if (pick < acc) {
      rarity = spec.tiers[i];
      break;
    }
  }
  const pool = spec.species[rarity] || [];
  const species = pool[Number(await stream.uint64n(pool.length))];
  return { rarity, species, byPity: false, stats: await replayStats(spec, stream, rarity) };
}

// Go's encoding/json writes < > & and the two line separators as \u escapes, which is part of the
// bytes the spec hash covers; JSON.stringify does not.
function goJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
}

/** The canonical bytes the spec hash covers: fields in the server's order, map keys sorted. */
export function canonicalSpecJson(spec) {
  const sorted = (obj) => Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
  return goJson({
    version: spec.version,
    algorithm: spec.algorithm,
    total: spec.total,
    tiers: spec.tiers,
    table: sorted(spec.table),
    species: sorted(spec.species),
    stat_names: spec.stat_names,
    stat_range: sorted(spec.stat_range),
  });
}

export async function specHash(spec) {
  return sha256Hex(enc.encode(canonicalSpecJson(spec)));
}

/**
 * Checks a receipt against the published rules. Returns { ok, checks: [{ id, ok, text }] }; a receipt
 * is fair only when every check passes. `published` is { version, spec_hash, spec }.
 */
export async function verifyReceipt(published, receipt) {
  const checks = [];
  const add = (id, ok, text) => checks.push({ id, ok, text });
  const fail = () => ({ ok: false, checks });

  if (!receipt || typeof receipt !== 'object') {
    add('shape', false, 'That is not a roll receipt.');
    return fail();
  }
  const result = receipt.result || {};
  const pity = receipt.pity_before || {};
  if (!receipt.committed) {
    add('committed', false, 'This egg was bought before provable rolls, so there is no seal to check.');
    return fail();
  }
  add('committed', true, 'The egg carried a seal (commitment) from the moment it was bought.');

  // 1. The published rules are intact, and the receipt names them.
  const spec = published.spec;
  const computed = await specHash(spec);
  add('spec-intact', computed === published.spec_hash, computed === published.spec_hash
    ? 'The published rules match their fingerprint.'
    : 'The published rules do not match their fingerprint: this page is not showing the real rules.');
  add('spec-version', receipt.spec_hash === published.spec_hash && receipt.version === published.version,
    receipt.spec_hash === published.spec_hash
      ? `The receipt was rolled under these published rules (version ${published.version}).`
      : 'The receipt was rolled under different rules than the ones published here (an older or newer version).');

  // 2. The revealed secret is the one the egg was sealed with.
  let seed;
  try {
    seed = hexToBytes(receipt.server_seed || '');
  } catch {
    seed = null;
  }
  if (!seed || seed.length !== 32) {
    add('seed-format', false, 'The revealed secret must be 32 bytes written as 64 hex digits.');
    return fail();
  }
  const sealed = await sha256Hex(seed);
  add('seal', sealed === receipt.commitment, sealed === receipt.commitment
    ? `SHA-256 of the revealed secret is the seal shown when the egg was bought (${receipt.commitment.slice(0, 16)}...).`
    : 'SHA-256 of the revealed secret does NOT match the seal: the game changed its secret after you bought the egg.');

  // 3. Replaying the roll gives the receipt's result.
  let replay;
  try {
    replay = await replayRoll(spec, {
      serverSeed: seed, eggId: String(receipt.egg_id), clientSeed: String(receipt.client_seed ?? ''), egg: receipt.egg_rarity,
      pityTarget: pity.target || '', pityCounter: Number(pity.counter || 0), pityThreshold: Number(pity.threshold || 0),
    });
  } catch (e) {
    add('replay', false, `The roll could not be replayed: ${e.message}`);
    return fail();
  }
  const claimed = result.stats || {};
  const statText = (s) => spec.stat_names.map((n) => `${n} ${s[n]}`).join(', ');
  const statsSame = spec.stat_names.every((n) => replay.stats[n] === claimed[n]);
  const same = replay.rarity === result.rarity && replay.species === result.species && replay.byPity === Boolean(result.by_pity) && statsSame;
  add('replay', same, same
    ? `Replaying the roll gives a ${replay.rarity} ${replay.species}${replay.byPity ? ' (guaranteed by the pity pick)' : ''} with ${statText(replay.stats)}, exactly what hatched.`
    : `Replaying the roll gives a ${replay.rarity} ${replay.species}${replay.byPity ? ' (pity)' : ''} with ${statText(replay.stats)}, but the receipt says ${result.rarity} ${result.species} with ${statText(claimed)}.`);

  return { ok: checks.every((c) => c.ok), checks };
}

/** The exact chance of each tier for an egg, as a percentage string (no rounding). */
export function percent(units, total) {
  const u = BigInt(units);
  const t = BigInt(total);
  // The spec total is 10^12 units, so 10^10 units are 1%; this formats without floating point.
  const scale = 10n ** 10n;
  const whole = (u * 100n) / t;
  const frac = (u * 100n * scale / t) % scale;
  if (frac === 0n) return `${whole}%`;
  return `${whole}.${frac.toString().padStart(10, '0').replace(/0+$/, '')}%`;
}
