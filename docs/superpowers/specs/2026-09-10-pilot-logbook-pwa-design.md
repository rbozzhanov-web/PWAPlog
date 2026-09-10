# Pilot Logbook browser-first PWA migration

## Purpose

Build an installable, offline-first Pilot Logbook PWA in this repository. The existing Expo 57 native application at `/Users/ramilbozzhanov/Developer/PilotLogbook-local` remains untouched and serves only as the behavioral source of truth during the migration.

The PWA stores active data locally in IndexedDB. It does not add account creation, cloud sync, or automatic cross-device backup. A future release that needs recovery or sync must make an explicit backend and authentication decision.

## Repository structure

Use an npm workspace:

```text
apps/web/                         Vite + React browser application
  src/app/                        routing and route layouts
  src/components/                 responsive UI components
  src/features/                   logbook, imports, salary, settings features
  src/db/                         Dexie schema, migrations, repositories
  src/platform/                   browser adapters for files, sharing, and PDF.js
  public/                         manifest icons and PWA assets
packages/core/                    platform-neutral domain library
  src/logbook/                    entry types, grouping, navigation, validation
  src/pdf-import/                 parser rules and extracted-PDF types
  src/crew-pay/                   schedule parsing and payroll calculations
  src/backup/                     backup format and PDF document model
  src/daynight/                   airport, timezone, and sun calculations
  src/**/__tests__/               Vitest regression and parity suites
```

`apps/web` may depend on `packages/core`; `packages/core` must not import React, React Native, Expo, browser DOM APIs, Dexie, or filesystem APIs. Path aliases must resolve workspace imports in both Vite and Vitest.

## Domain logic migration

Port these native sources into `packages/core`, retaining public behavior and tests:

- `src/types/logbook.ts`
- `src/lib/time.ts`, `groupEntries.ts`, `logbookNavigation.ts`, `formSchema.ts`, and `crewNames.ts`
- `src/lib/daynight/*`
- `src/lib/pdfImport/types.ts`, `patterns.ts`, `tokenize.ts`, `dedupe.ts`, `parseRoster.ts`, and `rules/*`
- `src/lib/crewPay/normsTable.ts`, `normLookup.ts`, `scheduleParser.ts`, `payPeriod.ts`, `kzPayroll.ts`, and `nbrkRate.ts`
- `src/lib/backup/format.ts` and `pdfDoc.ts`

Replace native-only implementation boundaries rather than porting them:

- Expo SQLite and Drizzle schema/queries become Dexie repositories.
- Expo document/file/print/sharing APIs become browser file, Blob, print, and share adapters.
- The hidden WebView PDF.js harness becomes direct PDF.js worker extraction.
- Native navigation and UI files are rebuilt as responsive React Router routes.

No Kazakhstan payroll, pay, or parser rule is intentionally changed during migration. A difference is treated as a regression unless a new parity test demonstrates a specific correction and documents it.

## IndexedDB model and migrations

Dexie owns the browser database and increments its schema version for every storage migration. A `metadata` record stores the completed application migrations and data format versions so upgrade work is idempotent and inspectable.

Tables:

- `flightEntries`: primary key `id`; indexed `date` and `importBatchId`; retains every existing field, including audit timestamps and PDF-import provenance.
- `aircraft`: primary key `id`; unique registration represented and enforced in the repository.
- `settings`: singleton pay-settings record.
- `crewSchedules`: primary key `month` (`YYYY-MM`); stores schedule days, matched codes, payable-sector inputs, and `importedAt`.
- `exchangeRates`: primary key `month` (`YYYY-MM`); the stored NBRK/manual EUR/KZT rate.
- `taxableYtdOverrides`: primary key `month` (`YYYY-MM`); cumulative taxable income entering that month.
- `monthlyPayDays`: primary key `month` (`YYYY-MM`); vacation, paid vacation, training, and medical-exam counts.
- `metadata`: keys for database and app migration facts.

Each repository accepts validated domain objects and returns domain objects. UI code does not issue raw Dexie queries. Multi-table writes, including backup restoration and an approved import review, run inside Dexie transactions.

## Backups and import

The existing native logbook backup format remains exactly compatible:

- App ID: `pilot-logbook`
- Format version: `1`
- Fields: `exportedAt`, `entryCount`, and `entries`
- Restore behavior: validation first, then merge by stable entry ID; repeated imports are a no-op.

The PWA provides this as a first-class onboarding and Settings action: **Import existing PilotLogbook backup**. It presents validation errors and an added/updated/unchanged preview before any write.

Salary settings and schedules are absent from the native logbook backup. The PWA therefore has a separate versioned pay-data export/import envelope containing settings, schedules, monthly rates, taxable-YTD overrides, and monthly pay-day facts. It does not claim that a native v1 logbook backup contains salary data.

Exports serialize JSON to a Blob download. When `navigator.share` supports file sharing, the UI may offer it as an enhancement; download remains the reliable fallback. The UI explains that browser-local data requires an explicit backup to transfer or recover it.

## PDF import

The web adapter takes a `File` from a file input or drag/drop zone, reads it as an `ArrayBuffer`, and extracts it through `pdfjs-dist` with a browser Worker. It returns the existing core contract:

```ts
interface ExtractedPage {
  items: Array<{ str: string; x: number; y: number; width: number }>;
  width: number;
  height: number;
}
```

Coordinates are normalized to top-origin positioning before the core parser sees them. The parser selection, Air Astana rules, candidates, warnings, and review-before-save workflow retain their native semantics. There is no WebView, bundled `file://` PDF.js harness, Expo asset handling, or Hermes workaround.

## Routes and UX

- `/logbook`: default route; month-grouped flights and totals across all data.
- `/logbook/new` and `/logbook/:id`: manual entry create/edit flows.
- `/import/logbook` and `/import/review`: PDF file selection, extraction, parser review, and approved save.
- `/salary`: a selected monthly schedule calculation.
- `/salary/import`: crew-schedule PDF file selection, parsing, review, and save.
- `/salary/settings`: contract terms, rates, overrides, and monthly pay-day configuration.
- `/settings`: logbook backups, pay-data backup, import existing native backup, and PWA/storage guidance.

The logbook displays all dates by default. It has no “All” year tab. Year chips scroll to December of their selected year and update their active state as the user scrolls. The layout is browser-responsive from phone width through desktop.

Salary is completely independent of logbook entries. It calculates only from an imported crew schedule for its selected month. If that schedule is missing, the salary route renders only a clear import prompt for the selected month. It must not show partial, inferred, or zero-valued salary calculations in its place. Deadheading/PAX/DHC sectors stay excluded from paid sectors.

## Offline and installation

`vite-plugin-pwa` with Workbox precaches the built application shell, manifest, icons, and static parser assets. The PWA must load an offline shell after a successful first load and retain all working data in IndexedDB while offline. PDF import, logbook editing, local backups, and browser PDF generation do not require a network connection.

The optional NBRK rate lookup remains an explicit user-triggered network action. Cached or manually entered rates remain usable offline. Installation is offered through the browser’s normal PWA install flow.

## Verification

Use Vitest for all core and web tests. Before moving calculation code, port existing pure-logic tests. Add a checked-in fixture for the current `realReport.test.ts` dependency on `/tmp/realcheck/pages.json`; tests must not require files outside this repository.

Parity suites compare the native behavior with the PWA core for:

- imported flight entries and totals;
- month/year grouping and chip navigation calculations;
- Air Astana schedule sector extraction;
- deadhead/PAX/DHC exclusion;
- salary components and progressive Kazakhstan ИПН;
- deductions, alimony, corporate pension, and take-home pay;
- vacation, training, and medical-day rules;
- native backup validation and merge behavior.

Web integration tests cover Dexie migrations, transactional restoration, missing-schedule salary states, PDF extraction normalization, and offline app-shell behavior. Installation and offline recovery receive browser-based manual checks before release.

## Delivery sequence

1. Scaffold workspace, Vite application, React Router, Vitest, PWA manifest/service worker, and responsive design primitives.
2. Extract and test platform-neutral core logic; formalize checked-in fixtures.
3. Add Dexie schema/migrations/repositories and native-logbook backup import/export.
4. Build logbook CRUD, totals, month grouping, and year-chip scrolling.
5. Add PDF.js extraction and logbook PDF import/review.
6. Add salary settings, schedule import, schedule-only salary calculation, and missing-month state.
7. Add browser PDF export, offline/install checks, and native/PWA fixture parity review.

## Non-goals

- Changing or deleting the Expo/iOS app.
- Expo Web as the long-term PWA foundation.
- Browser auto-backup that creates a Files-app document without user action.
- Cloud storage, automatic sync, authentication, or a backend.
- Unverified legal or payroll-rule changes.
