# The Shards — landing site

The public site for **The Shards**, a game where any person can create their own MMORPG and players can step into every world that has been forged. Served from this repo by GitHub Pages at <https://theshardsgame.com> (see `CNAME`).

It is plain static files: HTML, CSS and a little JavaScript. There is no build step and no framework.

```
index.html            the landing page
fairness/             /fairness/ — how companion rolls are proven fair, and the verifier
  index.html          the page
  verify.js           the verifier (SHA-256 + HMAC via WebCrypto), also run by the tests
  page.js             wires the page: the odds table and the "Check a roll" form
  spec.json           the published rules a receipt is checked against (generated, see below)
  sample-receipt.json a genuine receipt for the "Try a sample" button
assets/               nocturne.css (the design system), site.css, fonts, logo
test/                 verifier tests and the game server's golden vectors
scripts/              sync-from-server.js, check-links.js
```

## Working on it

```
npm test                       # verifier tests against the server's vectors
node scripts/check-links.js    # every local file the pages reference exists
python -m http.server 8765     # then open http://127.0.0.1:8765/ (pages use absolute /paths)
```

Colours, type and components come from the Nocturne design system in `assets/nocturne.css`; change the look there. (The page used to be a single 730 KB design-tool bundle with React and a runtime inlined; it was unpacked on 2026-11-14 into these files, and the page looks the same.)

## Fair rolls

The game seals every companion egg with a secret when it is bought, reveals it when the egg hatches, and anyone can replay the roll. The scheme is implemented in the game server (`internal/companions/fairness.go`) and ported to `fairness/verify.js`. The server's tests write `fairness_vectors.json`, and `npm test` checks the port against it, so the two cannot drift apart.

When the server's `FairnessVersion` or its odds/species change:

```
node scripts/sync-from-server.js ../server/internal/companions/testdata/fairness_vectors.json
npm test
```

then commit `fairness/spec.json` and `test/vectors.json`. Receipts name the rules they were rolled under, so a receipt from an older version is reported as such rather than checked against the wrong numbers.
