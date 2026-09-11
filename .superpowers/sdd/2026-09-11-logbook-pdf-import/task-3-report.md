# Task 3 report: file selection and review routes

Implemented the browser PDF import workflow in the `feat/pdf-import` worktree.

## Delivered

- Added `/import/logbook` with an accessible file picker, drag/drop target, local-processing status, PDF validation, extraction failure messaging, and no-candidate parser messaging.
- Added transient in-memory draft state shared between the import and review routes; refreshing or directly opening review does not expose a stale persisted draft.
- Added `/import/review` with source-file summary, confidence badges, parser and duplicate warnings, cross-check totals, editable flight fields, per-flight discard/restore, and explicit confirmation.
- Confirmation delegates to the typed PDF import repository, clears the transient draft, and returns to `/logbook`; no entries are written before confirmation.
- Added responsive off-white/white-card/navy/blue/gold styling, including the blue drag-active state and phone-friendly single-column candidate cards.
- Lazy-loaded the PDF routes so PDF.js is not loaded by ordinary logbook/settings routes.

## Verification

- Focused UI tests cover picker selection, drag/drop, extraction failure, empty parser results, warnings, editable candidates, discard/restore, zero pre-confirm writes, confirmation, and return navigation.
- Full test suite and production build are run immediately before commit.

## Commit

`feat: add reviewed logbook PDF import`
