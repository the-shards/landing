# The Shards: landing site

The public site for **The Shards**, a game where any person can create their own MMORPG and players can step into every world that has been forged. Served from this repo by GitHub Pages at <https://theshardsgame.com> (see `CNAME`).

It is plain static files: HTML, one CSS file and a little JavaScript. There is no build step and no framework.

```
index.html            the landing page: hero, playtest sign-up, launcher download, legal
fairness/             /fairness/: how companion rolls are proven fair, and the verifier
  index.html          the page
  verify.js           the verifier (SHA-256 + HMAC via WebCrypto), also run by the tests
  page.js             wires the page: the odds table and the "Check a roll" form
  spec.json           the published rules a receipt is checked against (generated, see below)
  sample-receipt.json a genuine receipt for the "Try a sample" button
legal/                the three PDFs the team uploads (see legal/README.md)
assets/               shards.css (the only stylesheet), fonts/ (Pixelwick), logo and icons
test/                 verifier tests, the server's golden vectors, and the design-rule tests
scripts/              sync-launcher.js, sync-from-server.js, check-links.js
```

## Working on it

```
npm test                       # verifier tests + the design rules (below)
node scripts/check-links.js    # every local file the pages and the stylesheet reference exists
node <any static server> .     # pages use absolute /paths, so serve the folder as the site root
```

## The design

Approved 2026-11-14 (colours voted). Tokens, fonts and components are all in `assets/shards.css`; change the look there.

- **Two pixel fonts, both original work.** `Pixelwick` for everything that is read, `PxCrack` (Pixelwick with hairline cracks) only for the wordmark, the H1, section titles, card titles and the footer slogan.
- **Plain ASCII only (32 to 126).** The fonts have no accents, curly quotes, dashes, middle dot or copyright sign; a missing glyph falls back to a different typeface and looks wrong. Write `-` and `Copyright`, never `&middot;` or `&copy;`. No italic, and no `font-weight`: the fonts have no bold, and a browser-made bold smears the pixels. Titles get their weight from a hard 2 to 3px duplicate of the glyphs (`text-shadow` with no blur), which stays crisp; emphasis inside text is colour.
- **Sizes are whole multiples of 10 px, never `rem`, `em` or `clamp`.** The fonts are built on a 10px em and blur at any other size. Body text is 20px; the H1 is 70px, section titles 50px and card titles 40px (one step down on phones).
- **Flat and hard-edged:** 4px borders, hard offset shadows, no gradients, blur, rounded corners or animation. Green (`--action`) is for actions and section titles, violet (`--accent`) is decorative only.
- **No tracking and no third-party requests.** The only outside addresses are the Google Form link, the launcher on the API, and the test-vectors link on GitHub.

`npm test` enforces these (`test/site.test.js`), so a change that breaks one fails loudly. The one addition to the approved palette is a soft red (`--fail`) for a failed check on the fair-rolls page.

## Content that is not final

No `[BRACKET]` placeholders are left on the page (`npm test` fails if one comes back). What is a stand-in:

- **Legal documents.** The three cards say "Coming soon" and have no PDF link, because the documents are not written yet. When one is ready, put it in `legal/` (names in `legal/README.md`), replace "Coming soon" with "Last updated <date>" and add the "Open PDF" link (the markup is in the comment at the top of `index.html`).
- **System requirements.** Windows 10 or 11 64-bit, OpenGL 3.3, about 250 MB of disk and 1 GB of RAM. The RAM figure is an estimate, not a measurement: confirm it by running the stack.
- **Playtest dates and contact.** March 10 to April 1, 2027 (in the intro and under "What to expect"); Discord is both the feedback and the Contact link.
- **Launcher address.** It points at the sandbox API; switch it when there is a production API (see below).

## The launcher download

The Download button links straight to the launcher the API serves (`<api>/releases/files/TheShardsLauncher.exe`), so a browser downloads it directly from the site. The version, size and SHA-256 next to it are written, not typed:

```
node scripts/sync-launcher.js [API base URL]   # default: https://api.sandbox.theshardsgame.com
```

It reads the release manifest for the version, downloads the launcher to measure its size and checksum, and rewrites the card in `index.html`. Review the diff and commit it. The launcher rarely changes (it updates the game itself), so run this when the launcher does. When there is a production API, run it with that address once and the link follows.

## Fair rolls

The game seals every companion egg with a secret when it is bought, reveals it when the egg hatches, and anyone can replay the roll. The scheme is implemented in the game server (`internal/companions/fairness.go`) and ported to `fairness/verify.js`. The server's tests write `fairness_vectors.json`, and `npm test` checks the port against it, so the two cannot drift apart.

When the server's `FairnessVersion` or its odds/species change:

```
node scripts/sync-from-server.js ../server/internal/companions/testdata/fairness_vectors.json
npm test
```

then commit `fairness/spec.json` and `test/vectors.json`. Receipts name the rules they were rolled under, so a receipt from an older version is reported as such rather than checked against the wrong numbers.
