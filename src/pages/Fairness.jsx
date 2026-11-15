import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import { usePageTitle } from '../components/usePageTitle.js';
import { percent, verifyReceipt } from '../lib/fairness/verify.js';
import published from '../lib/fairness/spec.json';
import sampleReceipt from '../lib/fairness/sample-receipt.json';

const PLACEHOLDER = '{ "version": 1, "egg_id": "...", "commitment": "...", "server_seed": "...", ... }';

const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);

function OddsTable() {
  const { spec } = published;
  return (
    <table id="odds-table">
      <caption className="sr">Chance of each companion rarity, by egg</caption>
      <thead>
        <tr>
          <th scope="col">Egg</th>
          {spec.tiers.map((tier) => <th key={tier} scope="col">{cap(tier)}</th>)}
        </tr>
      </thead>
      <tbody>
        {spec.tiers.map((egg) => (
          <tr key={egg}>
            <th scope="row">{cap(egg)} egg</th>
            {spec.table[egg].map((units, i) => (
              <td key={spec.tiers[i]} className={spec.tiers[i] === egg ? 'big' : undefined}>{percent(units, spec.total)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Result({ out }) {
  return (
    <div id="result" className={`result ${out.ok ? 'ok' : 'bad'}`} role="status" aria-live="polite">
      <h3>{out.ok ? 'Fair: this roll checks out.' : 'This roll did not verify.'}</h3>
      <ul>
        {out.checks.map((check, i) => (
          <li key={i} className={check.ok ? 'pass' : 'fail'}>
            <span className="mark">{check.ok ? '[OK]' : '[X]'}</span>
            <span>{check.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const fail = (text) => ({ ok: false, checks: [{ ok: false, text }] });

export default function Fairness() {
  usePageTitle('Fair rolls - The Shards');
  const [receipt, setReceipt] = useState('');
  const [out, setOut] = useState(null);

  async function check(text) {
    let parsed;
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      setOut(fail('That is not valid JSON. Paste the whole receipt exactly as the game copied it.'));
      return;
    }
    if (!globalThis.crypto || !globalThis.crypto.subtle) {
      setOut(fail('Your browser cannot run the check here (it needs a secure page). Open this page over https.'));
      return;
    }
    setOut(await verifyReceipt(published, parsed));
  }

  function trySample() {
    const text = JSON.stringify(sampleReceipt, null, 2);
    setReceipt(text);
    check(text);
  }

  return (
    <Layout prose>
      <section className="intro" aria-labelledby="fair-title">
        <div className="badge">FAIR ROLLS</div>
        <h1 id="fair-title" className="display-h1">Every egg, provably fair.</h1>
        <p>Companion eggs are a gamble, so you should not have to take our word for the odds. Every egg is sealed with a secret the game cannot change after you buy it. When it hatches the secret is revealed, and anyone can re-run the roll and see that the companion is the one the published odds produce.</p>
      </section>

      <section aria-labelledby="how-title">
        <h2 id="how-title" className="display-h2">How an egg is rolled</h2>
        <ol className="steps">
          <li>
            <h3 className="card-title">The game seals the egg</h3>
            <p>When you buy an egg the game picks a secret number and shows you only its fingerprint, the <span className="em">seal</span> (a SHA-256 hash). A hash cannot be reversed, but it cannot be changed either: the game is now bound to that secret.</p>
          </li>
          <li>
            <h3 className="card-title">You add your own seed</h3>
            <p>When you hatch, your game adds a random seed of its own (or one you type). The game did not know it when it sealed the egg, so it could not have chosen a secret that suits it. The first seed the game receives for an egg is <span className="em">locked</span>: a failed or repeated attempt reuses it, so the game cannot reroll an egg by pretending something went wrong. Your game also checks, by itself, that the seal at the reveal is the one the egg showed before.</p>
          </li>
          <li>
            <h3 className="card-title">The roll</h3>
            <p>The companion's rarity, species and four stats are drawn from the secret and your seed, using the exact odds and stat ranges published below and nothing else. Same inputs, same result, every time, on any computer.</p>
          </li>
          <li>
            <h3 className="card-title">The secret is revealed</h3>
            <p>Your roll receipt shows the secret. Its hash must equal the seal you saw at purchase, and re-running the roll must give the companion you got. If either is off, you can see it.</p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="proof-title">
        <h2 id="proof-title" className="display-h2">What is proven, and what is not</h2>
        <div className="two">
          <div className="card on-panel pad-28">
            <h3 className="card-title">Proven by this page</h3>
            <ul className="plain">
              <li>The <span className="em">rarity</span> of the companion an egg hatches.</li>
              <li>Which <span className="em">species</span> it is, including when your pity pick decides it.</li>
              <li>Its four <span className="em">stats</span> (power, vigor, agility, mind), each within the range published for its rarity.</li>
              <li>That the game used the secret it sealed at purchase, and the odds published here.</li>
            </ul>
          </div>
          <div className="card on-panel pad-28">
            <h3 className="card-title">Rolled privately</h3>
            <ul className="plain">
              <li>Affinity and personality are rolled by the game and stay private (the secret would reveal them), so they are not part of this check.</li>
              <li>An egg bought before this feature has no seal and cannot be verified. In the game, such a companion is marked <span className="em">No verified roll</span>, and so is any companion that did not come from a sealed egg; a companion made by fusing is marked <span className="em">Fused</span>. Be careful buying an unmarked one.</li>
              <li>This proves the roll was made as published. It does not prove the game picks fair prices, which are shown in the store.</li>
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="odds-title">
        <h2 id="odds-title" className="display-h2">The odds</h2>
        <p className="muted">Exact chances, read from the same file the verifier below uses. Each row is an egg, each column the companion it can hatch into.</p>
        <div className="table-wrap"><OddsTable /></div>
        <p className="muted" id="spec-line">Rules version {published.version}. Fingerprint of these rules: {published.spec_hash.slice(0, 16)}... (the verifier checks it).</p>
      </section>

      <section id="verify" aria-labelledby="verify-title">
        <h2 id="verify-title" className="display-h2">Check a roll</h2>
        <p>In the game, open the companion panel (P) and press <span className="em">Roll receipt</span> on a companion you hatched. That copies the receipt. Paste it here.</p>
        <label className="sr" htmlFor="receipt">Roll receipt</label>
        <textarea id="receipt" rows="10" spellCheck="false" placeholder={PLACEHOLDER} value={receipt} onChange={(e) => setReceipt(e.target.value)} />
        <div className="actions">
          <button className="btn btn-fill" id="verify-btn" type="button" onClick={() => check(receipt)}>Verify this roll</button>
          <button className="btn btn-outline" id="sample-btn" type="button" onClick={trySample}>Try a sample receipt</button>
        </div>
        {out ? <Result out={out} /> : null}
        <p className="muted">Everything runs in your browser: the receipt is not sent anywhere.</p>
      </section>

      <section aria-labelledby="trust-title">
        <h2 id="trust-title" className="display-h2">Check it without trusting this page</h2>
        <p>The whole scheme is a few lines, so you can re-implement it in any language. The server's own tests write <a href="https://github.com/the-shards/landing/blob/main/test/vectors.json">test vectors</a>, and this page's verifier is tested against them.</p>
        <details>
          <summary>The exact rule</summary>
          <pre className="code" id="algorithm">{published.spec.algorithm}</pre>
        </details>
      </section>
    </Layout>
  );
}
