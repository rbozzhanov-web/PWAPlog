# Pilot Logbook PWA

eScrew is an installable, offline-first app for an airline pilot's roster, pay and logbook. Its
app shell and working data remain on the device after the first successful load.

- **Roster** — import an AIMS Crew Schedule saved as a Web Archive, and read the duties, sectors,
  hotels and crew it contains.
- **Pay** — check a payslip against the published CrewPay norms and Kazakh payroll rules, from an
  AIMS roster or a Crew Schedule PDF.
- **Logbook** — flight records entered by hand, imported from a flight-time PDF, or taken from
  completed AIMS sectors.
- **Home** — the next sector, its report countdown, crew, and destination weather.

Weather is the one feature that reaches the network (`api.open-meteo.com`, for the destination
airport's coordinates); everything else works offline. No account, no sync, no backend.

## Develop and verify

```sh
npm install
npm run dev
npm run test
npm run build
```

`npm run dev` prints the local development URL. Use `npm run test:web` to run only the browser test project.

## Deploy

The app is a static build: `npm run build` emits `apps/web/dist`, and that directory is the whole
site.

**Cloudflare Pages** (primary) is wired through the dashboard's Git integration — connect this
repository under *Workers & Pages → Create → Pages → Connect to Git* and set:

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `apps/web/dist` |
| Root directory | *(repository root — the build uses npm workspaces)* |
| Environment variable | `NODE_VERSION` = `22` |

`NODE_VERSION` matters: the Pages default is older than this build needs. Leave
`PUBLIC_BASE_PATH` unset, because Pages serves the app from the domain root. Every push to `main`
then deploys itself, and `_redirects` hands React Router's own routes (`/roster`, `/logbook/:id`,
`/flight/:key`) back to `index.html` instead of 404ing on a direct visit or a refresh.

`wrangler.toml` covers a direct deploy instead — `npm run deploy:cloudflare`, with
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment.

**GitHub Pages** still deploys from `.github/workflows/deploy-pages.yml`, where the workflow sets
`PUBLIC_BASE_PATH=/PWAPlog/` because that target serves the app from a repository subpath rather
than the root.

## Install and use offline

Open the app in a supported browser once while online. Then use the browser's install action (for example, the install icon in Chrome's address bar, or **Install app** from its menu). On iPhone or iPad, use Safari's Share menu and choose **Add to Home Screen**. The installed app opens in its own window.

After the first successful load, the service worker caches the application shell, manifest, and icon. You can reopen the logbook while offline; a first visit still requires an internet connection to download the app.

## Data and backups

Pilot Logbook data is stored only in this browser until you export a backup; this release does not synchronize devices or automatically create a Files-app document.

The **logbook backup** import/export flow is compatible with the native PilotLogbook v1 backup format. It contains flight-log entries only and preserves their stable IDs and audit fields.

Pay settings, imported schedules, exchange rates, taxable-YTD overrides, and monthly pay-day facts are intentionally outside that native logbook backup. A future **pay-data backup** will use its own versioned format; restoring a native logbook backup must never overwrite or infer salary data.
