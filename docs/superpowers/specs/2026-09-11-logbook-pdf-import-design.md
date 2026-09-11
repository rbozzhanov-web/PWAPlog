# Browser logbook PDF import design

## Goal

Allow a pilot to select or drag an Air Astana logbook PDF, extract positioned text in a browser worker, review parser candidates, edit them, and import approved entries into IndexedDB.

## Boundaries

`apps/web/src/platform/pdf/extractText.ts` is the only PDF.js/browser adapter. It accepts a `File`, reads its ArrayBuffer, and returns core `ExtractedPage[]` with top-origin coordinates. `packages/core` parser selection/rules remain unchanged. Feature code invokes typed draft/import repositories and never reads Dexie tables directly.

## Routes and workflow

- `/import/logbook`: drop zone/file picker; shows extraction and parsing errors as actionable states.
- `/import/review`: candidate table/cards with editable fields, confidence/warnings, individual discard, and an explicit import confirmation.

An import is never persisted until confirmation. Approved entries retain parser provenance: `source: 'pdf_import'`, a generated `importBatchId`, and current audit timestamps. Duplicate candidate rows are removed through existing core dedupe logic before review.

## Visual direction

Use the established off-white canvas and white rounded cards. The drop zone has a blue active state; confidence and parsing warnings use restrained gold/neutral treatment rather than alarm red unless extraction fails. Phone review is card-based; desktop may use a dense table.

## Verification

Test worker-output normalization without a real browser worker, parser-to-review mapping against checked-in fixtures, no persistence before confirmation, imported provenance, duplicate removal, editable review fields, and extraction error rendering. Preserve all core parser regression tests.
