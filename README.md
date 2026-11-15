# The Shards: landing site

The public site for **The Shards**, a game where any person can create their own MMORPG and players can step into every world that has been forged. It is a small React single-page app (React 18, Vite, react-router-dom 6, plain JavaScript) served as static files from S3 behind CloudFront. See `README-deploy.md` for the hosting and how to deploy (not yet deployed: the live site is still the old static version on GitHub Pages until the cutover described there).

```
index.html            the Vite entry (the Content-Security-Policy meta is added at build time, see csp.js)
vite.config.js        build + test configuration; csp.js is the policy
src/
  main.jsx, App.jsx   router: /  /fairness  /signup  /login  /download  and a not-found page (a trailing slash works too)
  config.js           the ONE place VITE_API_BASE is read (default https://api.sandbox.theshardsgame.com)
  pages/              Home, Fairness, Signup, Login, Download, NotFound
  components/         Layout (skip link, header, footer), form pieces
  lib/account/        account.js (API client, validation, error mapping, safe redirects, session storage),
                      SessionContext.jsx (React context), navigate.js
  lib/fairness/       verify.js (the pure verifier), spec.json (published rules), sample-receipt.json
  styles/shards.css   the one stylesheet (global)
public/assets/        fonts (Pixelwick), logo and icons, served at /assets/...
test/                 vitest tests (below) and vectors.json from the game server
scripts/              sync-from-server.js
.github/workflows/    test.yml (npm ci, npm test, npm run build), deploy.yml (S3 + CloudFront)
```

## Working on it

```
npm ci
npm run dev        # http://localhost:5173
npm test           # vitest: verifier vs server vectors, account logic, pages, fake-API integration, design rules, production build
npm run build      # dist/
```

Set `VITE_API_BASE` (for example in an untracked `.env.local`) to point at another API; the build puts the same host in the CSP `connect-src`.

## Accounts and the launcher download

The launcher is **not** a file on this site. The API serves it to logged-in players only, and this site is the front end for that:

- `/signup`: username, password, confirm, and an invitation code (the field is shown unless `GET /api/auth/registration` says `invite_required: false`; it is shown if that call fails). Same rules as the server: username 3 to 32 of `A-Za-z0-9_-`, not starting with `guest_` or `char_`; password 8 to 72 characters.
- `/login`: honours `?next=/download`; only a same-site path starting with a single `/` is accepted (no `//`, scheme or backslash), anything else goes to `/download`.
- `/download`: without a session it redirects to `/login?next=/download`. With one it shows the player, the launcher version, size (MB) and SHA-256, and a "Download for Windows" button.

The API contract this front end follows (base `API_BASE`, no trailing slash):

| Call | Answer |
|---|---|
| `GET /api/auth/registration` | 200 `{mode, invite_required}` |
| `POST /api/auth/register` `{username, password, invite_code}` | 201 `{player_id, token, username, is_admin}`; 403 `code: invite_required`; 409 taken; 400 invalid; 429 |
| `POST /api/auth/login` `{username, password}` | 200 same shape; 401 wrong; 403 banned; 429 with `Retry-After` seconds |
| `GET /api/downloads/launcher/info` (Bearer) | 200 `{available, file, version, size, sha256, updated_at}`; 404 `launcher_unavailable`; 401 dead token |
| `POST /api/downloads/launcher/ticket` (Bearer) | 200 `{url, expires_in}`; the browser is sent to `API_BASE + url` with `window.location.assign`, never fetched |

The session is `{token, username, player_id}` in `sessionStorage` under `shards.session`: never in a URL, never logged, dropped on logout or on any 401. The API must allow this site's origin in its CORS settings. The site is only for Windows.

## The design

Approved 2026-11-14 (colours voted). Tokens, fonts and components are all in `src/styles/shards.css`; change the look there.

- **Two pixel fonts, both original work.** `Pixelwick` for everything that is read, `PxCrack` (Pixelwick with hairline cracks) only for the wordmark, the H1, section titles, card titles and the footer slogan.
- **Plain ASCII only (32 to 126).** The fonts have no accents, curly quotes, dashes, middle dot or copyright sign; a missing glyph falls back to a different typeface and looks wrong. Write `-` and `Copyright`, never `&middot;` or `&copy;`; check marks are `[OK]` and `[X]`. No italic, and no `font-weight`. Titles get their weight from a hard 2 to 3px duplicate of the glyphs (`text-shadow` with no blur); emphasis inside text is the `.em` colour class.
- **Sizes are whole multiples of 10 px, never `rem`, `em` or `clamp`.** Body text and inputs are 20px; the H1 is 70px, section titles 50px and card titles 40px (one step down on phones).
- **Flat and hard-edged:** 4px borders, hard offset shadows, no gradients, blur, rounded corners or animation. Green (`--action`) is for actions and section titles, violet (`--accent`) is decorative only. The one addition to the approved palette is a soft red (`--fail`) for errors; an error always also says `[X]` in text.
- **No tracking and no third-party requests.** The only outside addresses are the Google Form link, Discord, the test-vectors link on GitHub, and the API. No inline styles (`style=` props), no inline scripts, no `dangerouslySetInnerHTML`.

`npm test` enforces these (`test/site.test.jsx`: it renders every route and builds the site), so a change that breaks one fails loudly.

## Content that is not final

- **Legal documents.** The three cards say "Coming soon" and have no PDF link, because the documents are not written yet. When one is ready, put the PDF in `public/legal/` (`terms-and-conditions.pdf`, `privacy-policy.pdf`, `playtest-agreement.pdf`), replace "Coming soon" in `src/pages/Home.jsx` with "Last updated <date>" and add the "Open PDF" link (the markup is in the comment at the top of that file).
- **System requirements.** Windows 10 or 11 64-bit, OpenGL 3.3, about 250 MB of disk and 1 GB of RAM. The RAM figure is an estimate, not a measurement: confirm it by running the stack.
- **Playtest dates and contact.** March 10 to April 1, 2027; Discord is both the feedback and the Contact link.
- **API address.** The default is the sandbox API; set `VITE_API_BASE` for another one.

## Fair rolls

The game seals every companion egg with a secret when it is bought, reveals it when the egg hatches, and anyone can replay the roll. The scheme is implemented in the game server (`internal/companions/fairness.go`) and ported to `src/lib/fairness/verify.js`. The server's tests write `fairness_vectors.json`, and `npm test` checks the port against it (`test/verify.test.js`), so the two cannot drift apart. The page (`src/pages/Fairness.jsx`) reads the published rules from `spec.json` and runs the verifier in the browser; the receipt is never sent anywhere.

When the server's `FairnessVersion` or its odds/species change:

```
node scripts/sync-from-server.js ../server/internal/companions/testdata/fairness_vectors.json
npm test
```

then commit `src/lib/fairness/spec.json` and `test/vectors.json`. Receipts name the rules they were rolled under, so a receipt from an older version is reported as such rather than checked against the wrong numbers.
