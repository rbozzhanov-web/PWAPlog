# Pilot Logbook CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the responsive local Logbook experience with manual CRUD, totals, and year-chip navigation.

**Architecture:** Typed repositories remain the sole persistence boundary. React routes load repository data and supply it to focused list/form components; the existing core package retains grouping and navigation calculations.

**Tech Stack:** React, React Router, TypeScript, Dexie, Vitest, React Testing Library, fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-09-10-logbook-crud-design.md`

## Global Constraints

- All data is shown by default; never add an All-year control.
- UI must not call Dexie tables directly; use typed repositories.
- New entries have UUID IDs, ISO audit timestamps, `source: 'manual'`, and zero-valued counters.
- Validate date, departure, arrival, and non-negative numeric fields before mutation.
- Use the approved off-white, white-card, navy, blue, and restrained-gold visual system.
- Browser tests use fake IndexedDB and assert visible behavior.

---

### Task 1: Complete typed flight-entry CRUD repository

**Files:**
- Modify: `apps/web/src/db/repositories/flightEntries.ts`
- Create: `apps/web/src/db/repositories/__tests__/flightEntries.test.ts`

**Interfaces:**
- Produces `listFlightEntries()`, `getFlightEntry(id)`, `createFlightEntry(entry)`, `updateFlightEntry(entry)`, and `deleteFlightEntry(id)`.

- [ ] **Step 1: Write failing repository tests**

```ts
test('creates, updates, lists, and deletes a manual entry', async () => {
  await createFlightEntry(db, entry({ id: 'one', date: '2026-01-02' }));
  await updateFlightEntry(db, entry({ id: 'one', remarks: 'updated' }));
  expect(await listFlightEntries(db)).toMatchObject([{ id: 'one', remarks: 'updated' }]);
  await deleteFlightEntry(db, 'one');
  expect(await listFlightEntries(db)).toEqual([]);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm run test:web -- apps/web/src/db/repositories/__tests__/flightEntries.test.ts`

Expected: FAIL because one or more CRUD methods are absent.

- [ ] **Step 3: Implement minimal typed methods**

Use `db.flightEntries` only inside this repository. List descending by ISO date; return domain records rather than Dexie table types.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:web -- apps/web/src/db/repositories/__tests__/flightEntries.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/db/repositories/flightEntries.ts apps/web/src/db/repositories/__tests__/flightEntries.test.ts
git commit -m "feat: add flight entry repository CRUD"
```

### Task 2: Add validated manual entry form and edit/delete routes

**Files:**
- Create: `apps/web/src/features/logbook/entryForm.ts`, `FlightEntryForm.tsx`, `EntryEditorPage.tsx`
- Create: `apps/web/src/features/logbook/__tests__/EntryEditorPage.test.tsx`
- Modify: `apps/web/src/app/routes.tsx`, `apps/web/src/styles/global.css`

**Interfaces:**
- `validateManualEntry(input): ValidationResult` returns field errors or a `FlightLogEntry`.
- `EntryEditorPage` creates at `/logbook/new`, edits/deletes at `/logbook/:id`.

- [ ] **Step 1: Write failing form behavior tests**

```tsx
test('blocks an empty route and saves a valid manual flight', async () => {
  renderEditor('/logbook/new');
  await user.click(screen.getByRole('button', { name: 'Save flight' }));
  expect(await screen.findByText('Departure is required')).toBeVisible();
  await user.type(screen.getByLabelText('Departure'), 'UAAA');
  await user.type(screen.getByLabelText('Arrival'), 'UACC');
  await user.click(screen.getByRole('button', { name: 'Save flight' }));
  expect(await screen.findByRole('heading', { name: 'Pilot Logbook' })).toBeVisible();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm run test:web -- apps/web/src/features/logbook/__tests__/EntryEditorPage.test.tsx`

Expected: FAIL because editor routes/components do not exist.

- [ ] **Step 3: Implement validation and editor**

Build a single-column form with date, route, flight number, aircraft, total minutes, counters, and remarks. Generate UUID/timestamps for create; preserve ID/createdAt and update updatedAt for edit. Show a confirmation state before delete. Use repository methods exclusively.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:web -- apps/web/src/features/logbook/__tests__/EntryEditorPage.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/logbook apps/web/src/app/routes.tsx apps/web/src/styles/global.css
git commit -m "feat: add manual flight entry editor"
```

### Task 3: Build grouped Logbook list, totals, and year navigation

**Files:**
- Create: `apps/web/src/features/logbook/LogbookPage.tsx`, `LogbookList.tsx`, `YearChips.tsx`, `totals.ts`
- Create: `apps/web/src/features/logbook/__tests__/LogbookPage.test.tsx`
- Modify: `apps/web/src/app/routes.tsx`, `apps/web/src/styles/global.css`

**Interfaces:**
- `sumFlightMinutes(entries): number` and existing `groupEntries`, `yearsWithEntries`, `targetMonthForYear` drive rendered UI.
- `YearChips` accepts `{ years: number[]; activeYear?: number; onSelect(year: number): void }`.

- [ ] **Step 1: Write failing list/navigation tests**

```tsx
test('shows grouped months, total time, and December-target year chips without All', async () => {
  seedEntries([entry({ date: '2025-01-02', totalTimeMinutes: 60 }), entry({ date: '2024-12-30', totalTimeMinutes: 90 })]);
  renderLogbook();
  expect(await screen.findByText('2h 30m')).toBeVisible();
  expect(screen.getByRole('button', { name: '2025' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm run test:web -- apps/web/src/features/logbook/__tests__/LogbookPage.test.tsx`

Expected: FAIL because the page/list components do not exist.

- [ ] **Step 3: Implement list and navigation**

Load entries through `listFlightEntries`; render empty state, total card, new-flight action, month anchors, and route rows linking to editors. Year selection uses the December target, falling back to the newest available month in that year. Update active chip from intersection/scroll state without fabricating empty months.

- [ ] **Step 4: Verify GREEN and full suite**

Run: `npm run test:web -- apps/web/src/features/logbook/__tests__/LogbookPage.test.tsx && npm run test && npm run build`

Expected: PASS; app retains offline build output.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/logbook apps/web/src/app/routes.tsx apps/web/src/styles/global.css
git commit -m "feat: add grouped logbook experience"
```

## Plan review

- Task 1 creates the repository APIs consumed by Tasks 2 and 3.
- Task 2 owns mutation validation and user-safe delete confirmation.
- Task 3 owns all group, totals, responsive list, and year-chip rendering.
- The plan covers each goal/spec behavior without PDF, payroll, cloud, or export scope creep.
