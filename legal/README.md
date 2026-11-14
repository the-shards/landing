# Legal documents

The landing page will link to three PDFs in this folder. They are written and uploaded by the team; nothing here is legal text.

| File name | Document |
|---|---|
| `terms-and-conditions.pdf` | Terms and Conditions |
| `privacy-policy.pdf` | Privacy Policy |
| `playtest-agreement.pdf` | Playtest Agreement |

None exists yet, so each card on the page says "Coming soon" and has no link (a link to a missing file would be a 404).

To publish one: upload the PDF here, then in `index.html` replace that card's "Coming soon" with "Last updated <date>" and add the "Open PDF" link. The exact markup is in the comment at the top of `index.html`. `scripts/check-links.js` then checks the file is there.
