# Legal documents

The landing page links to three PDFs in this folder. They are written and uploaded by the team; nothing here is legal text.

| File name | Document |
|---|---|
| `terms-and-conditions.pdf` | Terms and Conditions |
| `privacy-policy.pdf` | Privacy Policy |
| `playtest-agreement.pdf` | Playtest Agreement |

Until a file is uploaded its link on the page gives a 404. `scripts/check-links.js` lists the missing ones as warnings (not errors) so the site can ship before the PDFs exist.

After uploading a PDF, replace its `[DATE]` ("Last updated") in `index.html`.
