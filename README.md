# Parlay All Day

Private college football research with full-slate coverage, market pricing, independent audits, source-bound qualitative review, persistent price history and closing-line evaluation.

**Start here: [Deployment and morning handoff](DEPLOY.md).** GitHub stores the source; the included Render Blueprint runs the backend and persistent database. GitHub Pages alone is insufficient.

- Node.js 24.2 or later; no runtime npm dependencies.
- `npm ci --ignore-scripts`, `npm run check`, `npm test`.
- `npm start` opens the local service on port 8787. A clean checkout has no retained games or secrets. Configure provider keys as environment variables and enable collection through the app.
- Hosted mode requires HTTPS-origin configuration and owner authentication. The Blueprint generates the owner password and a scoped research-writer token.
- Every game has a source-linked fact review. Actual AI-authored review is clearly labeled and uses either the external assistant publisher or an optional model worker. Paid model requests default to zero.
- Spreads and moneylines remain experimental. Totals are comparison-only; simulations are unqualified research challengers. No profitable advantage is claimed.

This sanitized repository intentionally excludes the local database, credentials, downloaded provider feeds and private research history. The existing GitHub repository contains only source code. Private provider data and secrets must remain on the authenticated backend; review provider terms before sharing data.

The local working app and original desktop app remain separate. The existing repository is hendu1188/barnum-and-payme. The GitHub Pages landing screen does not run the backend. Production hosting still requires Render account setup and successful launch checks.
