# Tomorrow's GitHub and hosting handoff

The release uses the existing **GitHub repository and a password-protected Render web service**. GitHub Pages cannot run the Node backend or retain this database. A repository push alone does not make this application live.

## What is prepared

- A Node 24 service, owner authentication, HTTPS-origin enforcement, scoped research writer token and a minimal `/healthz` endpoint.
- A Render Blueprint with a single service instance and a persistent disk for the SQLite database, job queues, immutable history and backups.
- A GitHub Actions workflow that checks syntax, release contents, frozen model integrity and automated tests. It has read-only repository permissions and no provider credentials.
- A release scanner that rejects data files, connection files, database files, private user paths and common API-token formats.
- Empty-database startup: the app starts without fabricated games; the owner enables collection after configuring the existing provider keys.

## Before opening the hosting account

Use the sanitized **Parlay-All-Day-GitHub** folder or its release ZIP, not the working application's entire folder. Never upload its `data/`, `seed/`, credentials, local logs or retained provider feeds. The sanitized release includes only the runtime, fitted artifacts, aggregate research diagnostics, assets, tests and deployment files.

Keep all private data and credentials outside the source repository. Provider subscriptions and redistribution rights have not been reviewed for public distribution of raw odds or injury feeds. The app and the deployment are analytical paper research, with no automated wagering or proven profitable advantage.

## GitHub

1. Use the existing `hendu1188/barnum-and-payme` repository. Its prior history is retained.
2. Upload the sanitized release contents at the repository root, or add that repository as the local release's Git remote and push `main` after setting your Git author identity.
3. Confirm the **Verify Parlay All Day** workflow passes. No betting-data keys belong in the repository or its test workflow.

Saved GitHub authentication and the existing author identity were verified. Check the latest commit and Actions result in the repository; a source push alone does not launch the backend.

## Render

1. Connect the existing GitHub repository and create a Blueprint from `render.yaml`.
2. Review the selected plan and persistent-disk charge before creating the service. This configuration uses a paid disk-compatible plan. No paid hosting resource has been created.
3. Put the existing `ODDS_API_KEY` and `CFBD_API_KEY` into the host's secret fields. They are already present privately in the local app; they must be transferred through the host's secret manager, never a commit.
4. Render supplies the public HTTPS URL. The app uses `RENDER_EXTERNAL_URL` as its allowed origin, or an explicitly configured `APP_ORIGIN` if using a custom domain.
5. Render generates a strong `PARLAY_PASSWORD` and a separate `PARLAY_RESEARCH_TOKEN`. Retrieve the owner password privately from the dashboard and sign in with username `owner`. Do not send the research token to visitors; it can only read research context and publish research, not change budgets or export history.
6. Wait for `/healthz` to become healthy. Sign in, review the budget defaults and enable live collection in the app. The initial slate is downloaded automatically. Defaults remain 24 odds credits per Pacific day, 240 monthly and 30 CFBD requests daily.
7. Verify a fresh odds timestamp, schedule coverage, weather coverage, game audits and retained history after restarting the service. A successful deploy is not validation of the betting models.

Do not scale a disk-backed SQLite deployment beyond one instance. The persistent volume path is `/var/data/parlay`; the application, job queues and backups all use `PARLAY_DATA_DIR`. A PostgreSQL migration is a separate scale-up option, not required for this single-owner release.

## Full AI review

Every game has a deterministic, source-linked fact review and a persistent AI-review job. These fact reviews are clearly distinguished from AI-authored analysis.

Two AI-review routes are implemented:

- **Existing Codex research workflow:** fetch `/api/research/dossiers`, research the supplied facts and publish complete three-market reviews through `server/review-batch.cjs`. Hosted publishing uses `PARLAY_BASE_URL` and the scoped `PARLAY_RESEARCH_TOKEN`. Sources and current fingerprints are validated; stale reviews cannot become active.
- **Optional server-side model worker:** add `OPENAI_API_KEY` and `AI_MODEL` as host secrets/settings, then enable the reviewer and set a positive daily model-request budget in the app. A supported structured-output model such as `gpt-5-mini` can be configured. Model requests default to **zero**. There is no model-provider key configured locally, so no model API charges were incurred during preparation.

The server worker produces source-referenced support, a counterargument, what appears priced in and what would change the decision. It cannot invent a fact ID, publish an actionable totals opinion, change a numerical probability or bypass an audit. Reviews expire with their input snapshot. Requests and token usage are recorded separately from sports-data usage.

The existing desktop Codex schedule still requires that desktop environment to run. Hosted ingestion works independently once enabled; hosted AI review requires the model worker credentials, or an external assistant publishing to the hosted endpoint.

## Model release status

Spreads and moneylines remain experimental. Totals failed release checks and are comparison-only. The joint-score simulation is an unqualified challenger. No overnight implementation can create future graded outcomes or demonstrate a profitable advantage. Keep paper labels until prospective evidence supports a new release.

## Recovery and rollback

The app makes SQLite online backups under the persistent data directory. Export history and create a current database backup before changing model or database versions. Retain the previous source commit for rollback. Restarting or redeploying must not reset the disk or replace first forecasts. A model version cannot silently change its artifact hash.

## References checked during preparation

- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [Render web services](https://render.com/docs/web-services)
- [Render Blueprint fields](https://render.com/docs/blueprint-spec)
- [Render persistent disks](https://render.com/docs/disks)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [National Weather Service API](https://www.weather.gov/documentation/services-web-api)
