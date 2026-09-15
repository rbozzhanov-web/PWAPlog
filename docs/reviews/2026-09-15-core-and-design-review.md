# PWAPlog review — contents, core, and design correctness

Reviewed commit `433503a` on `claude/pwaplog-review-qchaoi` (identical to `main`), 2026-09-15.

Method: `npm install`, `npm run test`, `npx tsc -b apps/web`, `npm run build` (both with and
without `GITHUB_ACTIONS=true`), plus a read of `packages/core`, `apps/web`, and the design spec.
No production code was changed; two findings below were confirmed by temporary instrumentation
that was reverted.

## Verdict

`packages/core` is in good shape: platform-neutral (verified — no DOM, React, or Dexie imports
anywhere outside tests), densely documented with the payslip evidence behind each payroll rule,
and well covered by tests. The problems are almost all at the edges — the service worker, the
UI that calls the core, CI, and a design document that no longer describes the app.

Status at review time: **2 failing tests, 0 type errors, build succeeds.**

---

## Blocking

### 1. Offline is broken on the GitHub Pages deployment

`apps/web/vite.config.ts:37` hardcodes `navigateFallback: '/index.html'` while `base` is
`/PWAPlog/` under GitHub Actions (`apps/web/vite.config.ts:5`).

Verified against the built artifact (`GITHUB_ACTIONS=true npm run build`): the precache manifest
contains `url:"index.html"` (resolved to `/PWAPlog/index.html` against the SW scope), but the
navigation route is emitted as `createHandlerBoundToURL("/index.html")`, which resolves to
`/index.html` at the domain root. Workbox raises `non-precached-url` while evaluating `sw.js`,
so the service worker never installs: no app-shell cache and no offline support on the only
deploy target the repo has.

Fix: `navigateFallback: `${base}index.html``.

### 2. `npm test` is red, and CI never runs it

`.github/workflows/deploy-pages.yml` runs checkout → `npm ci` → `npm run build` → deploy.
Nothing gates on the test suite, so both failures below are already deployed.

**2a. `apps/web/src/app/App.test.tsx:12` — "opens a new primary-tab session on Home".**
The feature is broken, not the test. Instrumenting `apps/web/src/app/AppFrame.tsx:72-79` showed
the effect firing and calling `navigate('/')`, with the location still `/logbook` afterwards.
Cause: React Router's `useNavigate` sets its internal `activeRef` inside a `useEffect`, so a
`navigate()` issued from a `useLayoutEffect` on first mount is silently dropped. Changing that
single hook to `useEffect` makes the redirect work (verified locally, then reverted). The last
three commits on this branch were attempts at this behaviour.

**2b. `apps/web/src/features/roster/__tests__/RosterPage.test.tsx:85-87`.**
The test expects `roster-day-card--off` / `--doff` / `--today`; the component renders
`roster-timeline__day--*` (`apps/web/src/features/roster/RosterPage.tsx:123-128`). The test is
stale after the timeline redesign. The superseded `.roster-day-card*` rules are still in
`apps/web/src/styles/global.css` (lines 172-186, 1565, 2068-2149) as dead CSS.

### 3. ИПН is systematically understated

`apps/web/src/features/pay/PayPage.tsx:66` always passes `{ [payMonth]: taxableYtd }` as
`ytdOverrides`, and `taxableYtd` defaults to `0`. Core treats any *defined* value as a known
figure (`packages/core/src/crew-pay/payPeriod.ts`, the `ytdOverrides[key] !== undefined` check),
so the January replay is skipped and every month is taxed as if year-to-date income were zero —
the 10% band instead of 15% for anyone past 8 500 МРП. The replay logic the core was built
around never runs.

`apps/web/src/features/pay/PayPage.tsx:68` then persists that `0` to `taxableYtdOverrides`,
turning "not entered" into a stored fact.

An unset YTD must reach core as `undefined`, not `0`.

---

## Core findings

- **855 KB of airport data in the first-paint bundle.**
  `packages/core/src/crew-pay/normLookup.ts:1` imports `toIcaoCode` from
  `daynight/airportDb`, which eagerly imports `assets/airports.json` (855 KB) and builds three
  maps at module load. `packages/core/src/index.ts` re-exports `normLookup` and
  `apps/web/src/app/routes.tsx` imports core eagerly, so the entry chunk is **1.88 MB
  (534 KB gzip)** — the JSON was confirmed inlined at byte 372808 of `dist/assets/index-*.js`.
  A small ICAO↔IATA table covering only the codes in `normsTable.ts` would remove most of it.

- **`calculateDayNight` is never called.** `packages/core/src/daynight/` has no tests and no
  caller in `apps/web`, so day/night minutes are only ever typed by hand, despite the spec's
  parity requirement. It is also the sole reason `luxon` and `suncalc` are dependencies.

- **AIMS sectors are priced at 0 actual minutes.** `PayPage.tsx` maps roster flights with
  `totalTimeMinutes: 0`, so any sector missing from the published norms contributes nothing to
  pay. `PayHoursSummary.unlistedSectors` does surface this in the UI, which is the right
  instinct, but the figure is silently wrong until the pilot reads that line.

- **`mergeLogbookBackup` compares with `JSON.stringify`**
  (`packages/core/src/backup/logbook.ts:131`) — key-order sensitive. Re-importing a
  byte-identical backup whose key order differs from Dexie's insertion order reports every entry
  as "updated". The write stays idempotent; the added/updated/unchanged preview the spec
  promises does not.

- **Inconsistent timestamp parsing.** `apps/web/src/features/logbook/LogbookPage.tsx:157`
  parses with a `Z` suffix (UTC); `apps/web/src/features/home/HomePage.tsx`
  (`nextLayoverHours`, `dutyEndTimestamp`, the report countdown) parses the same naive AIMS
  strings without one, landing in the device's timezone. The "REPORT IN" countdown is wrong
  whenever the pilot is not in the station's zone. `importCompletedAims` mixes both conventions
  inside a single function.

- **Dead or missing core surface.** `packages/core/src/time.ts` is not exported from
  `index.ts`; `packages/core/src/logbook/validation.ts` is an `export {}` stub; `crewNames.ts`
  and `backup/pdfDoc.ts` from the spec's port list were never brought over.

- **`packages/core/src/__tests__/platformNeutral.test.ts` is vacuous.** It asserts
  `globalThis.document === undefined` in a Node environment, which is true regardless of what
  core imports. It does not check the boundary it is named for.

---

## Design-doc correctness

`docs/superpowers/specs/2026-09-10-pilot-logbook-pwa-design.md` no longer describes this app,
and it is explicit on the point: *"no eScrew name, roster integration, AIMS portal, or copied
copy/content is included."* The app ships all four — `<h1>eScrew</h1>`, a Roster tab, an AIMS
importer, `escrew-sky-background.webp`, and the `escrew.theme-preference.v1` storage key.

Other divergences:

- **Routes.** Spec: `/salary`, `/salary/import`, `/salary/settings`. Actual: a single `/pay`.
  `apps/web/src/app/routes.tsx:43` declares `/settings` with no element, which logs a React
  Router warning and only works because `AppFrame` renders the pager instead of `<Outlet/>`.
  The route elements for `/`, `/roster`, `/pay`, and `/logbook` are dead for the same reason.

- **Logbook navigation.** Spec: all dates by default, year chips *scroll* to December and track
  scroll position. Actual: chips *filter* to one year. `monthElements`, `registerMonth`, and
  `targetMonthForYear` are wired up and tested but never read — the scroll-spy is written and
  unused.

- **AIMS roster storage.** `apps/web/src/features/roster/aims.ts` keeps the roster in
  `localStorage`, outside the Dexie model the spec defines and outside every backup path — yet
  Pay depends on it. Clearing browser data loses the pay source with nothing to restore from.

- **Automatic network access.** Home fetches `api.open-meteo.com`
  (`apps/web/src/features/weather/weatherService.ts`). The caching and offline handling are
  careful, but it contradicts the spec's rule that network calls stay explicitly user-triggered,
  and it appears in neither the README nor the spec.

- **Branding is inconsistent even within the shell.** `apps/web/index.html` `<title>` says
  "Pilot Logbook", `apple-mobile-web-app-title` says "eScrew", the manifest says "Pilot
  Logbook". The README describes a pure logbook PWA with no mention of roster, pay, AIMS, or
  weather.

- **`base` detection is fragile.** `process.env.GITHUB_ACTIONS ? '/PWAPlog/' : '/'` flips on any
  GitHub Action, including a test-only job.

- **CSS hygiene.** 29 unused classes in a single 2 983-line `global.css`; the spec's
  `apps/web/src/components/` directory does not exist.

The doc drift needs a decision rather than a patch: either rewrite the spec around eScrew as it
now is, or move the roster/AIMS/weather work out of the Pilot Logbook PWA. As it stands the spec
reads as an authority that contradicts the code.

---

## Suggested order of work

1. `navigateFallback` (restores offline on the deployed site).
2. `useLayoutEffect` → `useEffect` for the launch redirect (`AppFrame.tsx:72`).
3. Pass `undefined` rather than `0` for an unentered taxable YTD (`PayPage.tsx:66`, `:68`).
4. Update the stale roster test and delete the superseded `.roster-day-card*` CSS.
5. Add `npm run test` to the Pages workflow before `npm run build`.
6. Decide the spec-vs-app question, then reconcile the document.
7. Lazy-load or shrink `airports.json` off the entry chunk.
