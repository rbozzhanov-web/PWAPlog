# Task 3 Report: Grouped Logbook Experience

## Delivered

- Replaced the `/logbook` placeholder with a repository-backed loading, error, empty, and populated experience.
- Added all-time and per-month flight-time totals plus descending month groups and editor-linked flight rows.
- Added unique descending year chips without an All control.
- Implemented December-first year navigation with fallback to the newest rendered month in years without December entries.
- Added intersection-driven active-year updates and automatic horizontal reveal of the active chip.
- Applied the approved off-white, white-card, navy, electric-blue, and restrained-gold visual system across responsive phone and desktop layouts.
- Extended mutation integration coverage so create, update, and delete flows wait for refreshed logbook totals or empty state.

## TDD Evidence

- RED: `npm run test:web -- apps/web/src/features/logbook/__tests__/LogbookPage.test.tsx` failed 4/4 because `/logbook` still rendered the placeholder and exposed none of the grouped-list behavior.
- GREEN: the same focused suite passed 4/4 after implementation, covering totals/grouping/no-All, empty state, December/fallback targets, and scroll-derived active-chip visibility.

## Verification

- `npm run test:web -- apps/web/src/features/logbook/__tests__/LogbookPage.test.tsx` passed: 4 tests.
- `npm run test` passed: 23 files, 139 tests.
- `npm run build` passed, including TypeScript and production PWA/service-worker output. Vite emitted the existing large-chunk advisory only.
- `git diff --check` passed.

## Final Review Fix: Manual-entry integer validation

- The manual-entry validator now rejects every non-integer minute or count input while retaining the existing zero-or-greater validation for negative values.
- Added editor-level regression coverage for fractional total time and fractional day landings. Each verifies the validation message and that no flight is persisted to IndexedDB.

### TDD Evidence

- RED: `npm run test:web -- apps/web/src/features/logbook/__tests__/EntryEditorPage.test.tsx` failed 2 tests because `0.5` total minutes and `0.5` day landings were saved.
- GREEN: the same focused suite passed 7/7 after adding integer validation.

### Final Verification

- `npm test` passed: 23 files, 141 tests.
- `npm run build` passed, including TypeScript and production PWA/service-worker output. Vite emitted the existing large-chunk advisory only.
- `git diff --check` passed.
