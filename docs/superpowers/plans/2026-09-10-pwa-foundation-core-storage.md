# Pilot Logbook PWA Foundation, Core, and Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an installable offline PWA foundation with tested platform-neutral Pilot Logbook logic, versioned IndexedDB storage, and import/export of existing native logbook backups.

**Architecture:** An npm workspace separates `apps/web`, the Vite/React/Dexie PWA, from `packages/core`, a browser- and native-independent TypeScript domain package. Core holds validated logbook/backup/parser/pay logic; the web app provides PWA, browser file, and persistence adapters. This plan is the first independently releasable migration slice; logbook CRUD UI, PDF extraction UI, and salary UI follow in later plans after these contracts are stable.

**Tech Stack:** Node/npm workspaces, Vite, React, TypeScript, React Router, vite-plugin-pwa/Workbox, Vitest, Dexie, Zod, Luxon, SunCalc, pdfjs-dist.

**Spec:** `docs/superpowers/specs/2026-09-10-pilot-logbook-pwa-design.md`

## Global Constraints

- Keep `/Users/ramilbozzhanov/Developer/PilotLogbook-local` read-only; copy only selected source logic into this repository.
- `packages/core` must not import React, React Native, Expo, browser DOM APIs, Dexie, or filesystem APIs.
- Preserve native backup app ID `pilot-logbook`, format version `1`, stable entry IDs, timestamps, and merge semantics.
- Do not modify Kazakhstan payroll or parser behavior while porting; move its regression tests with the code.
- Salary data is distinct from a native logbook backup and is not inferred during a logbook restore.
- Dexie writes that affect multiple records run in transactions; schema changes use explicit versioned migrations.
- Use Vitest and test-first Red/Green cycles. Every browser storage test uses a fresh fake IndexedDB database.
- PWA app shell must remain usable offline after its first successful load; working data lives only in IndexedDB.
- Use the approved aviation-inspired visual concept: off-white canvas, white rounded cards, soft gray dividers, deep navy typography, electric-blue primary actions, and restrained muted-gold highlights. Adapt the structure, never the eScrew branding or content.

---

## File structure

```text
package.json                              workspace scripts and shared tooling
tsconfig.base.json                        strict compiler defaults and aliases
vitest.workspace.ts                       core/web Vitest projects
apps/web/package.json                     browser dependencies and scripts
apps/web/vite.config.ts                   Vite aliases and PWA/Workbox configuration
apps/web/index.html                       PWA document metadata
apps/web/src/main.tsx                     React bootstrap and service-worker registration
apps/web/src/app/App.tsx                  router shell
apps/web/src/app/routes.tsx               route definitions and redirects
apps/web/src/styles/global.css            responsive design tokens and baseline styles
apps/web/src/db/database.ts               Dexie schema/version migrations
apps/web/src/db/repositories/*.ts         typed persistence boundaries
apps/web/src/features/settings/*.tsx      import/export onboarding UI
apps/web/src/platform/files.ts            browser JSON read/download/share adapter
apps/web/src/test/setup.ts                fake-indexeddb and browser test setup
packages/core/package.json                domain package exports
packages/core/src/logbook/*.ts            entry types, grouping, navigation, validation
packages/core/src/backup/logbook.ts       v1 native backup validation, merge, serialization
packages/core/src/pdf-import/*.ts         extracted-page types and parser rules
packages/core/src/crew-pay/*.ts           future salary core, ported with regression tests
packages/core/src/daynight/*.ts           airport and sun calculations
packages/core/src/**/__tests__/*.test.ts  core regression suites and checked-in fixtures
```

### Task 1: Create the workspace, offline shell, and test harness

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.workspace.ts`, `.gitignore`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`
- Create: `apps/web/src/main.tsx`, `apps/web/src/app/App.tsx`, `apps/web/src/app/routes.tsx`, `apps/web/src/styles/global.css`, `apps/web/src/test/setup.ts`
- Create: `apps/web/src/app/App.test.tsx`

**Interfaces:**
- Produces the npm commands `npm run dev`, `npm run build`, `npm run test`, and `npm run test:web`.
- Produces `<App />`, which later feature routes render inside.
- Defines workspace alias `@pilot-logbook/core` for the core package.

- [ ] **Step 1: Write the failing application-shell test**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

test('redirects an unknown location to the logbook shell', async () => {
  render(<MemoryRouter initialEntries={['/unknown']}><App /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Pilot Logbook' })).toBeVisible();
});
```

- [ ] **Step 2: Run the web test to verify it fails**

Run: `npm run test:web -- apps/web/src/app/App.test.tsx`

Expected: FAIL because the workspace and `App` module do not exist.

- [ ] **Step 3: Add workspace/tooling configuration and the minimal router shell**

Create a root workspace package with private workspaces `apps/*` and `packages/*`. Add root scripts:

```json
{
  "dev": "npm --workspace @pilot-logbook/web run dev",
  "build": "npm --workspace @pilot-logbook/web run build",
  "test": "vitest run --workspace vitest.workspace.ts",
  "test:web": "vitest run --project web"
}
```

Configure `apps/web/vite.config.ts` with React and `VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Pilot Logbook', short_name: 'Pilot Logbook', display: 'standalone', start_url: '/', theme_color: '#102a43', background_color: '#f7fafc' }, workbox: { navigateFallback: '/index.html' } })`. Use a `LogbookPlaceholder` route at `/logbook` with `<h1>Pilot Logbook</h1>`, redirect `/` and `*` to `/logbook`, and bootstrap with `registerSW({ immediate: true })`.

- [ ] **Step 4: Run the focused test and production build**

Run: `npm run test:web -- apps/web/src/app/App.test.tsx && npm run build`

Expected: PASS; Vite emits the manifest and service-worker assets.

- [ ] **Step 5: Commit the foundation**

```bash
git add package.json tsconfig.base.json vitest.workspace.ts .gitignore apps/web
git commit -m "feat: scaffold offline PWA workspace"
```

### Task 2: Port logbook domain types, grouping, and month/year navigation

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`
- Create: `packages/core/src/logbook/types.ts`, `packages/core/src/logbook/groupEntries.ts`, `packages/core/src/logbook/navigation.ts`, `packages/core/src/logbook/validation.ts`
- Create: `packages/core/src/logbook/__tests__/groupEntries.test.ts`, `packages/core/src/logbook/__tests__/navigation.test.ts`
- Source to read/copy behavior from: `/Users/ramilbozzhanov/Developer/PilotLogbook-local/src/types/logbook.ts`, `src/lib/groupEntries.ts`, `src/lib/logbookNavigation.ts`, `src/lib/formSchema.ts`

**Interfaces:**
- Produces `FlightLogEntry`, `groupEntries(entries)`, `yearsWithEntries(entries)`, and `targetMonthForYear(year)`.
- `targetMonthForYear(2025)` returns `'2025-12'`; UI later scrolls to that group. There is no synthetic all-years selection.

- [ ] **Step 1: Write failing grouping and year-target tests**

```ts
import { groupEntries, targetMonthForYear, yearsWithEntries } from '../index';

test('groups flights by descending YYYY-MM and sorts each group by date', () => {
  const groups = groupEntries([
    entry({ id: 'a', date: '2025-01-02' }),
    entry({ id: 'b', date: '2025-02-01' }),
    entry({ id: 'c', date: '2025-01-31' }),
  ]);
  expect(groups.map(({ month }) => month)).toEqual(['2025-02', '2025-01']);
  expect(groups[1].entries.map(({ id }) => id)).toEqual(['c', 'a']);
});

test('uses December as a selected year navigation target without an All year', () => {
  expect(yearsWithEntries([entry({ date: '2024-12-31' }), entry({ date: '2025-01-01' })])).toEqual([2025, 2024]);
  expect(targetMonthForYear(2024)).toBe('2024-12');
});
```

Define the local `entry(overrides)` fixture in the test with every required `FlightLogEntry` field set to safe zero/default values.

- [ ] **Step 2: Run the core test to verify it fails**

Run: `npm run test -- packages/core/src/logbook/__tests__/groupEntries.test.ts packages/core/src/logbook/__tests__/navigation.test.ts`

Expected: FAIL because `@pilot-logbook/core` and its exports do not exist.

- [ ] **Step 3: Port the minimum pure domain code**

Move the native `FlightLogEntry` interface into `types.ts`, changing only the import path. Implement `groupEntries` as a pure function that derives `YYYY-MM` from ISO dates, orders groups newest-first and entries newest-first. Implement `yearsWithEntries` as a unique descending numeric list and `targetMonthForYear` as ```${year}-12```.

- [ ] **Step 4: Run focused and whole-core tests**

Run: `npm run test -- packages/core/src/logbook/__tests__`

Expected: PASS with grouping and navigation regression assertions green.

- [ ] **Step 5: Commit the core logbook seam**

```bash
git add packages/core
git commit -m "feat: add platform-neutral logbook core"
```

### Task 3: Preserve native v1 backup validation, serialization, and merge semantics

**Files:**
- Create: `packages/core/src/backup/logbook.ts`, `packages/core/src/backup/__tests__/logbook.test.ts`
- Modify: `packages/core/src/index.ts`
- Source to read/copy behavior from: `/Users/ramilbozzhanov/Developer/PilotLogbook-local/src/lib/backup/format.ts`, `src/lib/backup/__tests__/format.test.ts`

**Interfaces:**
- Produces `BACKUP_APP_ID`, `BACKUP_FORMAT_VERSION`, `buildLogbookBackup(entries, exportedAt?)`, `parseLogbookBackup(raw)`, and `mergeLogbookBackup(existing, incoming)`.
- `parseLogbookBackup` returns `{ ok: true; backup: LogbookBackup } | { ok: false; error: string }`, never throws for user-provided JSON.

- [ ] **Step 1: Write failing compatibility tests using a literal native-shaped backup**

```ts
test('accepts and preserves a native v1 backup entry ID and audit fields', () => {
  const result = parseLogbookBackup(JSON.stringify(nativeV1Backup));
  expect(result).toMatchObject({ ok: true });
  if (result.ok) expect(result.backup.entries[0]).toMatchObject({ id: 'native-id', createdAt: '2025-01-01T00:00:00.000Z' });
});

test('merges by ID without deleting local flights or duplicating a repeated restore', () => {
  const first = mergeLogbookBackup([entry({ id: 'local' })], [entry({ id: 'native-id' })]);
  const second = mergeLogbookBackup(first.merged, [entry({ id: 'native-id' })]);
  expect(first).toMatchObject({ added: 1, updated: 0, unchanged: 0 });
  expect(second).toMatchObject({ added: 0, updated: 0, unchanged: 1 });
  expect(second.merged.map(({ id }) => id)).toEqual(expect.arrayContaining(['local', 'native-id']));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- packages/core/src/backup/__tests__/logbook.test.ts`

Expected: FAIL because the backup module is absent.

- [ ] **Step 3: Port the Zod schema exactly and rename only exported symbols**

Copy the native schema fields/defaults, app ID, format compatibility guard, serializer indentation, and merge-by-ID implementation. Import `FlightLogEntry` from `../logbook/types`. Keep unsupported future-format rejection, malformed JSON text, and validation error behavior intact.

- [ ] **Step 4: Run backup tests and the complete core suite**

Run: `npm run test -- packages/core/src/backup/__tests__/logbook.test.ts && npm run test -- packages/core/src`

Expected: PASS; no restore method throws on invalid user input.

- [ ] **Step 5: Commit backup compatibility**

```bash
git add packages/core/src/backup packages/core/src/index.ts
git commit -m "feat: preserve native logbook backup compatibility"
```

### Task 4: Port pure PDF parser and crew-pay logic with checked-in fixtures

**Files:**
- Create: `packages/core/src/pdf-import/{types,patterns,tokenize,dedupe,parseRoster}.ts`, `packages/core/src/pdf-import/rules/{index,genericRule}.ts`, `packages/core/src/pdf-import/rules/airlines/airAstana.ts`
- Create: `packages/core/src/crew-pay/{normsTable,normLookup,scheduleParser,payPeriod,kzPayroll,nbrkRate}.ts`
- Create: `packages/core/src/pdf-import/__fixtures__/realcheck-pages.json`
- Create: `packages/core/src/pdf-import/__tests__/*.test.ts`, `packages/core/src/crew-pay/__tests__/*.test.ts`
- Modify: `packages/core/src/index.ts`
- Source to read/copy behavior from: `/Users/ramilbozzhanov/Developer/PilotLogbook-local/src/lib/pdfImport/*`, `/Users/ramilbozzhanov/Developer/PilotLogbook-local/src/lib/crewPay/*`, and their tests.

**Interfaces:**
- Produces `ExtractedPage`, `ParserRule`, `parseRoster(pages)`, `parseCrewSchedule(pages)`, and `calculatePayPeriod(input)`.
- `ExtractedPage` is `{ items: TextItem[]; width: number; height: number }` with top-origin `y`; no platform import is permitted.

- [ ] **Step 1: Copy the native regression tests and convert their imports to package-relative paths**

Port parser, dedupe, pattern, real-report, norms, schedule-parser, pay-period, and Kazakhstan-payroll test files before copying production modules. Replace the `/tmp/realcheck/pages.json` read with a static JSON import from `../__fixtures__/realcheck-pages.json`; commit only scrubbed/approved fixture data already available to the project owner.

- [ ] **Step 2: Run the ported tests to verify they fail for absent modules, not fixture lookup**

Run: `npm run test -- packages/core/src/pdf-import/__tests__ packages/core/src/crew-pay/__tests__`

Expected: FAIL with unresolved core module imports. It must not fail with `ENOENT` for `/tmp/realcheck/pages.json`.

- [ ] **Step 3: Port pure modules without changing business branches**

Copy the listed parser and payroll modules. Replace `@/src/...` aliases with sibling core imports. Keep source data such as `normsTable` and `day/night` dependencies as static core assets. Do not move `extractText.ts` or `*Store.ts`; they are platform adapters. Ensure the pay parser retains exact handling of deadhead/PAX/DHC and all progressive ИПН, deduction, alimony, corporate-pension, vacation, training, and medical-day paths.

- [ ] **Step 4: Run parser/pay regression tests and TypeScript checks**

Run: `npm run test -- packages/core/src/pdf-import/__tests__ packages/core/src/crew-pay/__tests__ && npm run build`

Expected: PASS; the old temporary fixture path is absent from the repository (`rg '/tmp/realcheck' .` prints no matches).

- [ ] **Step 5: Commit ported core and fixtures**

```bash
git add packages/core
git commit -m "feat: port tested parser and payroll core"
```

### Task 5: Build versioned Dexie repositories and transactional logbook restoration

**Files:**
- Create: `apps/web/src/db/database.ts`, `apps/web/src/db/types.ts`, `apps/web/src/db/repositories/flightEntries.ts`, `apps/web/src/db/repositories/aircraft.ts`, `apps/web/src/db/repositories/metadata.ts`, `apps/web/src/db/repositories/logbookBackup.ts`
- Create: `apps/web/src/db/__tests__/database.test.ts`, `apps/web/src/db/repositories/__tests__/logbookBackup.test.ts`
- Modify: `apps/web/package.json`, `apps/web/src/test/setup.ts`

**Interfaces:**
- Produces `createPilotLogbookDb(name?: string): PilotLogbookDb` and `restoreLogbookBackup(db, raw): Promise<RestorePreview>`.
- `RestorePreview` is `{ added: number; updated: number; unchanged: number; total: number }`.
- Database v1 tables: `flightEntries: 'id,date,importBatchId'`, `aircraft: 'id,registration'`, `settings: 'id'`, `crewSchedules: 'month'`, `exchangeRates: 'month'`, `taxableYtdOverrides: 'month'`, `monthlyPayDays: 'month'`, `metadata: 'key'`.

- [ ] **Step 1: Write failing database migration and restore-transaction tests**

```ts
test('creates v1 tables and records the schema migration fact', async () => {
  const db = createPilotLogbookDb('migration-test');
  await db.open();
  expect(await db.metadata.get('schema-version')).toMatchObject({ value: 1 });
});

test('does not write any entries when a backup is invalid', async () => {
  const db = createPilotLogbookDb('invalid-restore-test');
  await expect(restoreLogbookBackup(db, '{bad json')).rejects.toThrow('not valid JSON');
  expect(await db.flightEntries.count()).toBe(0);
});
```

- [ ] **Step 2: Run the storage tests to verify they fail**

Run: `npm run test:web -- apps/web/src/db/__tests__/database.test.ts apps/web/src/db/repositories/__tests__/logbookBackup.test.ts`

Expected: FAIL because Dexie repositories do not exist.

- [ ] **Step 3: Implement Dexie v1 and repositories**

Install `dexie` and `fake-indexeddb`. In a Dexie `populate` callback write `{ key: 'schema-version', value: 1 }` to `metadata`. Make every record type explicit, including `SettingsRecord`, `CrewScheduleRecord`, and keyed monthly fact records. `restoreLogbookBackup` must parse first using `parseLogbookBackup`; for a failed parse throw `new Error(result.error)`. For a valid result, read existing entries and write the `mergeLogbookBackup` result inside `db.transaction('rw', db.flightEntries, async () => ...)`.

- [ ] **Step 4: Run storage tests, all web tests, and a production build**

Run: `npm run test:web -- apps/web/src/db && npm run test:web && npm run build`

Expected: PASS; an invalid restore leaves the table unchanged, and a repeated valid restore reports `unchanged` entries.

- [ ] **Step 5: Commit browser persistence**

```bash
git add apps/web/package.json package-lock.json apps/web/src/db apps/web/src/test
git commit -m "feat: add versioned IndexedDB logbook storage"
```

### Task 6: Add browser file adapters and the first-class native-backup onboarding flow

**Files:**
- Create: `apps/web/src/platform/files.ts`, `apps/web/src/platform/__tests__/files.test.ts`
- Create: `apps/web/src/features/settings/BackupImportPanel.tsx`, `apps/web/src/features/settings/BackupExportPanel.tsx`, `apps/web/src/features/settings/SettingsPage.tsx`, `apps/web/src/features/settings/__tests__/BackupImportPanel.test.tsx`
- Modify: `apps/web/src/app/routes.tsx`

**Interfaces:**
- Produces `readTextFile(file: File): Promise<string>`, `downloadJson(filename: string, body: string): void`, and `shareOrDownloadJson(file: File): Promise<'shared' | 'downloaded'>`.
- `BackupImportPanel` accepts `{ db: PilotLogbookDb }` and shows a preview only after successful parse; its explicit confirmation invokes `restoreLogbookBackup`.

- [ ] **Step 1: Write failing UX tests for parse-before-write and confirmation**

```tsx
test('shows a native backup merge preview and writes only after confirmation', async () => {
  const user = userEvent.setup();
  render(<BackupImportPanel db={db} />);
  await user.upload(screen.getByLabelText('Choose PilotLogbook backup'), new File([validBackupJson], 'pilot-logbook-backup.json', { type: 'application/json' }));
  expect(await screen.findByText('1 flight will be added')).toBeVisible();
  expect(await db.flightEntries.count()).toBe(0);
  await user.click(screen.getByRole('button', { name: 'Import 1 flight' }));
  expect(await db.flightEntries.count()).toBe(1);
});
```

- [ ] **Step 2: Run the feature test to verify it fails**

Run: `npm run test:web -- apps/web/src/features/settings/__tests__/BackupImportPanel.test.tsx`

Expected: FAIL because the feature and browser file adapter are absent.

- [ ] **Step 3: Implement the browser adapter and Settings routes**

Use `await file.text()` for input. Generate JSON download URLs with `URL.createObjectURL(new Blob([body], { type: 'application/json' }))`, click a temporary `<a download>`, then revoke the URL. For sharing, call `navigator.canShare?.({ files: [file] })` before `navigator.share({ files: [file], title: 'Pilot Logbook backup' })`; fall back to download on unsupported browsers or rejected share. Add `/settings` with headings for **Import existing PilotLogbook backup** and **Export logbook backup**, and text explaining that data is local to this browser/device and should be exported for recovery. Render Settings as grouped white rounded rows on the approved off-white/navy/blue visual system; do not add eScrew branding, roster/AIMS UI, or salary backup controls in this first slice.

- [ ] **Step 4: Run feature tests, web suite, and build**

Run: `npm run test:web -- apps/web/src/features/settings apps/web/src/platform && npm run test:web && npm run build`

Expected: PASS; no storage write occurs before the confirmation action.

- [ ] **Step 5: Commit backup onboarding**

```bash
git add apps/web/src/platform apps/web/src/features/settings apps/web/src/app/routes.tsx
git commit -m "feat: add native backup import and export"
```

### Task 7: Verify the phase as an installable offline foundation

**Files:**
- Create: `apps/web/src/app/__tests__/offlineShell.test.tsx`
- Create: `README.md`
- Modify: `apps/web/vite.config.ts`, `apps/web/src/styles/global.css`

**Interfaces:**
- Documents local-storage scope, install behavior, development commands, and the distinction between native logbook backups and future pay-data backups.
- Ensures app shell route rendering remains independent of network-dependent functionality.

- [ ] **Step 1: Write the failing offline-shell rendering test**

```tsx
test('renders the logbook shell without a network request', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  render(<MemoryRouter initialEntries={['/logbook']}><App /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Pilot Logbook' })).toBeVisible();
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails before the explicit offline assertion is supported**

Run: `npm run test:web -- apps/web/src/app/__tests__/offlineShell.test.tsx`

Expected: FAIL until the test setup and app shell are wired without a network bootstrap.

- [ ] **Step 3: Make offline behavior explicit and document it**

Ensure no initial route imports an NBRK fetch or a remote asset. Configure Workbox navigation fallback and precache static icons/manifest assets. Add a README section with exact commands (`npm install`, `npm run dev`, `npm run test`, `npm run build`), browser install instructions, and this notice: “Pilot Logbook data is stored only in this browser until you export a backup; this release does not synchronize devices or automatically create a Files-app document.”

- [ ] **Step 4: Run all automated verification and manual production checks**

Run: `npm run test && npm run build && rg '/tmp/realcheck|expo-|react-native|drizzle-orm/expo' packages/core apps/web`

Expected: all tests and build PASS; ripgrep has no matches. In a Chromium browser, load the production build once, toggle offline in DevTools, reload `/logbook`, and confirm the shell renders. Confirm the install prompt or browser install menu recognizes the manifest.

- [ ] **Step 5: Commit release-ready foundation documentation**

```bash
git add README.md apps/web/src/app apps/web/vite.config.ts apps/web/src/styles/global.css
git commit -m "docs: verify offline PWA foundation"
```

## Plan review checklist

- Spec coverage: Tasks 1 and 7 cover Vite, React Router, Workbox, installation, and offline shell. Tasks 2–4 extract and test core logic and replace the fixture dependency. Tasks 5–6 implement Dexie migrations and native backup import/export. Subsequent plans cover CRUD, browser PDF extraction/review, salary UI/schedule persistence, pay-data backup, PDF export, and full manual parity checks.
- Boundaries: core has no platform imports; web repositories own Dexie; browser adapters own `File`, `Blob`, and share APIs.
- Compatibility: native v1 backup validation/merge is tested before browser restoration; salary data is neither assumed nor overwritten.
- Red flags: no placeholders, generic testing directives, or undefined cross-task interfaces remain.
